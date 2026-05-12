"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MapGL, {
  Layer,
  NavigationControl,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
import { useDashboard } from "@/lib/store";
import {
  valorProvincia,
  valorDepartamento,
  totalNacional,
  totalProvincia,
  totalDepartamento,
} from "@/lib/analytics";
import {
  loadPaisGeojson,
  loadHexgridPais,
  loadDepartamentos,
  loadHexgridProvincia,
} from "@/lib/data";
import type { Dataset, Metric } from "@/lib/types";

const BASE_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";

type HexProps = { provincia_id: string; departamento_id: string | null };

export default function Vista3DPais() {
  const {
    dataset, nivel, provinciaSel, departamentoSel,
    delitoId, anio, metric,
    setDelito, setAnio, setMetric,
    selectProvincia, selectDepartamento, reset,
  } = useDashboard();

  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [paisGeo, setPaisGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [hexPais, setHexPais] = useState<GeoJSON.FeatureCollection | null>(null);
  const [depGeo, setDepGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [hexProv, setHexProv] = useState<GeoJSON.FeatureCollection | null>(null);
  const [hoverProvId, setHoverProvId] = useState<string | null>(null);
  const [hoverDepId, setHoverDepId] = useState<string | null>(null);
  const [loadingProv, setLoadingProv] = useState(false);
  const mapRef = useRef<MapRef | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Cargas iniciales (país).
  useEffect(() => {
    loadPaisGeojson().then(setPaisGeo).catch(console.error);
    loadHexgridPais().then(setHexPais).catch(console.error);
  }, []);

  // Lazy load al seleccionar provincia.
  useEffect(() => {
    if (!provinciaSel) {
      setDepGeo(null);
      setHexProv(null);
      return;
    }
    setLoadingProv(true);
    Promise.all([
      loadDepartamentos(provinciaSel),
      loadHexgridProvincia(provinciaSel),
    ])
      .then(([d, h]) => { setDepGeo(d); setHexProv(h); })
      .catch(console.error)
      .finally(() => setLoadingProv(false));
  }, [provinciaSel]);

  // FlyTo a la provincia seleccionada.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !paisGeo) return;
    if (provinciaSel) {
      const prov = paisGeo.features.find((f) => f.properties?.provincia_id === provinciaSel);
      if (prov) {
        const bbox = bboxOf(prov);
        map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
          padding: 80, pitch: viewMode === "3d" ? 55 : 0, bearing: 0, duration: 1200,
        });
      }
    } else {
      // Volver al país.
      map.easeTo({
        center: [-63.5, -38.5], zoom: 3.6,
        pitch: viewMode === "3d" ? 45 : 0, bearing: 0, duration: 1000,
      });
    }
  }, [provinciaSel, paisGeo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize defensivo.
  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const tick = () => mapRef.current?.getMap()?.resize();
    const obs = new ResizeObserver(tick);
    obs.observe(el);
    const iv = setInterval(tick, 300);
    const stop = setTimeout(() => clearInterval(iv), 3000);
    return () => { obs.disconnect(); clearInterval(iv); clearTimeout(stop); };
  }, [hexPais, hexProv]);

  // Animar cambio 2D/3D.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.easeTo({
      pitch: viewMode === "3d" ? (provinciaSel ? 55 : 45) : 0,
      bearing: 0, duration: 600,
    });
  }, [viewMode, provinciaSel]);

  // ============ DATOS ENRIQUECIDOS ============
  const ai = useMemo(() => (dataset ? dataset.anios.indexOf(anio) : -1), [dataset, anio]);
  const di = useMemo(() => {
    if (!dataset) return -1;
    if (delitoId === "all") return -1;
    return dataset.delitos.findIndex((d) => d.id === delitoId);
  }, [dataset, delitoId]);

  // Valores por provincia (vista país).
  const valoresProv = useMemo(() => {
    if (!dataset || ai < 0) return new Map<string, number>();
    const m = new Map<string, number>();
    dataset.provincias.forEach((p, pi) => {
      const v = di < 0
        ? totalProvincia(dataset, pi, ai, metric)
        : valorProvincia(dataset, pi, di, ai, metric);
      m.set(p.id, v);
    });
    return m;
  }, [dataset, ai, di, metric]);

  // Valores por departamento (vista provincia).
  const valoresDep = useMemo(() => {
    if (!dataset || ai < 0) return new Map<string, number>();
    const m = new Map<string, number>();
    dataset.departamentos.forEach((d, idx) => {
      const v = di < 0
        ? totalDepartamento(dataset, idx, ai, metric)
        : valorDepartamento(dataset, idx, di, ai, metric);
      m.set(d.id, v);
    });
    return m;
  }, [dataset, ai, di, metric]);

  // Hexgrid país enriquecido con altura/color por valor de su provincia.
  const hexPaisEnriched = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!hexPais || valoresProv.size === 0 || nivel !== "pais") return null;
    return enrichHexgrid(hexPais, (p) => valoresProv.get(p.provincia_id) ?? 0);
  }, [hexPais, valoresProv, nivel]);

  // Hexgrid provincia enriquecido por departamento.
  const hexProvEnriched = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!hexProv || valoresDep.size === 0 || nivel !== "provincia") return null;
    return enrichHexgrid(hexProv, (p) => valoresDep.get(p.departamento_id ?? "") ?? 0);
  }, [hexProv, valoresDep, nivel]);

  const labelPointsPais = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!paisGeo) return null;
    return {
      type: "FeatureCollection",
      features: paisGeo.features
        .filter((f) => (f.properties as any)?.centroid)
        .map((f) => ({
          type: "Feature",
          properties: {
            nombre: (f.properties as any).nombre,
            provincia_id: (f.properties as any).provincia_id,
          },
          geometry: { type: "Point", coordinates: (f.properties as any).centroid },
        })),
    };
  }, [paisGeo]);

  const labelPointsDep = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!depGeo) return null;
    return {
      type: "FeatureCollection",
      features: depGeo.features
        .filter((f) => (f.properties as any)?.centroid)
        .map((f) => ({
          type: "Feature",
          properties: {
            nombre: (f.properties as any).nombre,
            departamento_id: (f.properties as any).departamento_id,
          },
          geometry: { type: "Point", coordinates: (f.properties as any).centroid },
        })),
    };
  }, [depGeo]);

  // ============ TEXTO ============
  const delitoNombre = delitoId === "all"
    ? "Todos los delitos (suma SNIC)"
    : (dataset?.delitos.find((d) => d.id === delitoId)?.nombre ?? "");
  const totalAll = useMemo(() => {
    if (!dataset || ai < 0) return 0;
    return totalNacional(dataset, -1, ai, "hechos");
  }, [dataset, ai]);
  const totalSel = useMemo(() => {
    if (!dataset || ai < 0) return 0;
    return totalNacional(dataset, di, ai, "hechos");
  }, [dataset, di, ai]);

  if (!dataset) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de control */}
      <section className="rounded-xl border border-line bg-white p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b border-line-subtle pb-3">
          <div className="flex items-baseline gap-5">
            <div>
              <div className="eyebrow">Total Argentina · {anio}</div>
              <div className="mt-0.5 text-[22px] font-semibold leading-none tracking-tight text-ink num">
                {totalAll.toLocaleString("es-AR")}
              </div>
              <div className="mt-0.5 text-[11px] text-ink-3">hechos agregados de todas las categorías</div>
            </div>
            <div className="h-10 w-px bg-line" />
            <div>
              <div className="eyebrow">Cobertura</div>
              <div className="mt-0.5 text-[22px] font-semibold leading-none tracking-tight text-ink num">
                {dataset.provincias.length}<span className="text-[14px] text-ink-3"> / {dataset.departamentos.length}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-ink-3">provincias / departamentos</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[11px] text-ink-3">
              Categoría: <span className="font-semibold text-ink">{totalSel.toLocaleString("es-AR")}</span> hechos
            </div>
            <div className="inline-flex overflow-hidden rounded-md border border-line bg-paper">
              {(["2d", "3d"] as const).map((m, i) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={[
                    "px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-wider transition",
                    i === 0 ? "border-r border-line" : "",
                    viewMode === m ? "bg-ink text-paper" : "text-ink-2 hover:text-ink",
                  ].join(" ")}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <label className="flex min-w-0 flex-col gap-2">
            <span className="eyebrow">Tipo de delito</span>
            <select
              value={delitoId}
              onChange={(e) => setDelito(e.target.value)}
              className="rounded-md border border-line bg-paper px-3 py-2.5 text-[14px] text-ink outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="all">— Todos los delitos (suma SNIC) —</option>
              {dataset.delitos.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="eyebrow">Métrica</span>
            <div className="inline-flex overflow-hidden rounded-md border border-line bg-paper">
              {(["tasa", "hechos"] as const).map((m, i) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={[
                    "px-4 py-2.5 text-[13px] font-medium transition",
                    i === 0 ? "border-r border-line" : "",
                    metric === m ? "bg-ink text-paper" : "text-ink-2 hover:text-ink",
                  ].join(" ")}
                >
                  {m === "tasa" ? "Tasa /100k" : "Hechos"}
                </button>
              ))}
            </div>
          </label>

          <label className="flex min-w-0 flex-col gap-2">
            <span className="flex items-baseline justify-between">
              <span className="eyebrow">Año</span>
              <span className="mono num text-[14px] font-semibold text-ink">{anio}</span>
            </span>
            <input
              type="range"
              min={dataset.anios[0]}
              max={dataset.anios[dataset.anios.length - 1]}
              step={1}
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[10.5px] text-ink-4 mono num">
              <span>{dataset.anios[0]}</span>
              <span>{dataset.anios[dataset.anios.length - 1]}</span>
            </div>
          </label>
        </div>
      </section>

      {/* Mapa */}
      <div ref={wrapperRef} className="relative h-[680px] overflow-hidden rounded-xl border border-line shadow-card">
        <MapGL
          ref={mapRef}
          initialViewState={{
            longitude: -63.5,
            latitude: -38.5,
            zoom: 3.6,
            pitch: 45,
            bearing: 0,
          }}
          mapStyle={BASE_STYLE}
          minZoom={3}
          maxZoom={11}
          maxPitch={viewMode === "3d" ? 70 : 0}
          onMouseMove={(e) => {
            const f = e.features?.[0];
            if (!f) { setHoverProvId(null); setHoverDepId(null); return; }
            const props = f.properties ?? {};
            if (nivel === "pais") setHoverProvId(props.provincia_id ?? null);
            else setHoverDepId(props.departamento_id ?? null);
          }}
          onMouseLeave={() => { setHoverProvId(null); setHoverDepId(null); }}
          onClick={(e) => {
            const f = e.features?.[0];
            const props = (f?.properties ?? {}) as any;
            if (nivel === "pais") {
              const provId = props.provincia_id;
              if (provId) selectProvincia(provId);
            } else {
              const depId = props.departamento_id;
              if (depId) selectDepartamento(depId === departamentoSel ? null : depId);
            }
          }}
          interactiveLayerIds={[
            nivel === "pais"
              ? (viewMode === "3d" ? "hex-pais-3d" : "hex-pais-2d")
              : (viewMode === "3d" ? "hex-prov-3d" : "hex-prov-2d"),
          ]}
          style={{ height: "100%", width: "100%", background: "#0a1220" }}
        >
          <NavigationControl position="top-right" visualizePitch showCompass showZoom />

          {/* === Vista país === */}
          {nivel === "pais" && paisGeo && (
            <Source id="prov-outline" type="geojson" data={paisGeo}>
              <Layer
                id="prov-fill-bg"
                type="fill"
                paint={{ "fill-color": "#0f1a2a", "fill-opacity": 0.55 }}
              />
              <Layer
                id="prov-line-glow"
                type="line"
                paint={{ "line-color": "#00bb7f", "line-width": 4, "line-opacity": 0.16, "line-blur": 2 }}
              />
              <Layer
                id="prov-line"
                type="line"
                paint={{
                  "line-color": [
                    "case",
                    ["==", ["get", "provincia_id"], hoverProvId ?? "__none__"], "#00ffaa",
                    "#00bb7f",
                  ],
                  "line-width": [
                    "case",
                    ["==", ["get", "provincia_id"], hoverProvId ?? "__none__"], 2.4,
                    1.4,
                  ],
                  "line-opacity": 0.9,
                }}
              />
            </Source>
          )}

          {nivel === "pais" && hexPaisEnriched && (
            <Source id="hex-pais" type="geojson" data={hexPaisEnriched}>
              {viewMode === "3d" ? (
                <Layer
                  id="hex-pais-3d"
                  type="fill-extrusion"
                  paint={{
                    "fill-extrusion-height": ["get", "height"],
                    "fill-extrusion-base": 0,
                    "fill-extrusion-color": colorInterpolate(),
                    "fill-extrusion-opacity": 0.75,
                    "fill-extrusion-vertical-gradient": true,
                  }}
                />
              ) : (
                <Layer
                  id="hex-pais-2d"
                  type="fill"
                  paint={{
                    "fill-color": colorInterpolate(),
                    "fill-opacity": 0.82,
                  }}
                />
              )}
            </Source>
          )}

          {nivel === "pais" && labelPointsPais && (
            <Source id="prov-labels" type="geojson" data={labelPointsPais}>
              <Layer
                id="prov-label-text"
                type="symbol"
                layout={{
                  "text-field": ["get", "nombre"],
                  "text-font": ["Noto Sans Bold"],
                  "text-size": ["interpolate", ["linear"], ["zoom"], 3, 9, 5, 13, 7, 18],
                  "text-anchor": "center",
                  "text-allow-overlap": false,
                  "text-letter-spacing": 0.04,
                  "text-padding": 4,
                }}
                paint={{
                  "text-color": "#ffffff",
                  "text-halo-color": "#0a1220",
                  "text-halo-width": 2.2,
                  "text-halo-blur": 0.5,
                  "text-opacity": [
                    "case",
                    ["==", ["get", "provincia_id"], hoverProvId ?? ""], 1,
                    0.85,
                  ],
                }}
              />
            </Source>
          )}

          {/* === Vista provincia === */}
          {nivel === "provincia" && depGeo && (
            <Source id="dep-outline" type="geojson" data={depGeo}>
              <Layer
                id="dep-fill-bg"
                type="fill"
                paint={{ "fill-color": "#0f1a2a", "fill-opacity": 0.55 }}
              />
              <Layer
                id="dep-line-glow"
                type="line"
                paint={{ "line-color": "#00bb7f", "line-width": 4, "line-opacity": 0.18, "line-blur": 1.8 }}
              />
              <Layer
                id="dep-line"
                type="line"
                paint={{
                  "line-color": [
                    "case",
                    ["==", ["get", "departamento_id"], departamentoSel ?? "__none__"], "#00ffaa",
                    ["==", ["get", "departamento_id"], hoverDepId ?? "__none__"], "#00d294",
                    "#00bb7f",
                  ],
                  "line-width": [
                    "case",
                    ["==", ["get", "departamento_id"], departamentoSel ?? "__none__"], 3.2,
                    ["==", ["get", "departamento_id"], hoverDepId ?? "__none__"], 2.4,
                    1.2,
                  ],
                  "line-opacity": 0.92,
                }}
              />
            </Source>
          )}

          {nivel === "provincia" && hexProvEnriched && (
            <Source id="hex-prov" type="geojson" data={hexProvEnriched}>
              {viewMode === "3d" ? (
                <Layer
                  id="hex-prov-3d"
                  type="fill-extrusion"
                  paint={{
                    "fill-extrusion-height": ["get", "height"],
                    "fill-extrusion-base": 0,
                    "fill-extrusion-color": colorInterpolate(),
                    "fill-extrusion-opacity": departamentoSel
                      ? ["case", ["==", ["get", "departamento_id"], departamentoSel], 0.9, 0.22]
                      : 0.78,
                    "fill-extrusion-vertical-gradient": true,
                  }}
                />
              ) : (
                <Layer
                  id="hex-prov-2d"
                  type="fill"
                  paint={{
                    "fill-color": colorInterpolate(),
                    "fill-opacity": departamentoSel
                      ? ["case", ["==", ["get", "departamento_id"], departamentoSel], 0.92, 0.18]
                      : 0.85,
                  }}
                />
              )}
            </Source>
          )}

          {nivel === "provincia" && labelPointsDep && (
            <Source id="dep-labels" type="geojson" data={labelPointsDep}>
              <Layer
                id="dep-label-text"
                type="symbol"
                layout={{
                  "text-field": ["get", "nombre"],
                  "text-font": ["Noto Sans Bold"],
                  "text-size": ["interpolate", ["linear"], ["zoom"], 5, 9, 7, 12, 9, 15],
                  "text-anchor": "center",
                  "text-allow-overlap": false,
                  "text-letter-spacing": 0.03,
                  "text-padding": 3,
                }}
                paint={{
                  "text-color": "#ffffff",
                  "text-halo-color": "#0a1220",
                  "text-halo-width": 1.8,
                  "text-halo-blur": 0.5,
                  "text-opacity": [
                    "case",
                    ["==", ["get", "departamento_id"], hoverDepId ?? ""], 1,
                    0.85,
                  ],
                }}
              />
            </Source>
          )}
        </MapGL>

        {/* Leyenda */}
        <div className="pointer-events-none absolute left-4 top-4 w-[290px] rounded-lg border border-emerald-900/40 bg-[#0a1220]/90 p-3 shadow-float backdrop-blur">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-emerald-400">
            Vista {viewMode.toUpperCase()} · {anio} · {nivel === "pais" ? "País" : "Provincia"}
          </div>
          <div className="mt-1 truncate text-[13px] font-semibold text-white" title={delitoNombre}>
            {delitoNombre}
          </div>
          <div className="mt-1 text-[11.5px] text-emerald-300/80 num">
            {totalSel.toLocaleString("es-AR")} hechos nacionales
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full" style={{
            background: "linear-gradient(90deg, #004e3b 0%, #009767 20%, #00bb7f 50%, #edb200 80%, #ef4444 100%)",
          }} />
          <div className="mt-1 flex justify-between text-[10px] text-emerald-300/70 num">
            <span>bajo</span><span>medio</span><span>alto</span>
          </div>
          <div className="mt-3 border-t border-emerald-900/40 pt-2 text-[10.5px] leading-snug text-emerald-300/70">
            {nivel === "pais"
              ? "Click en una provincia para hacer drill-down."
              : "Click en un departamento para fijarlo. Botón ↺ para volver al país."}
          </div>
        </div>

        {/* HoverCard */}
        {dataset && (nivel === "pais" ? hoverProvId : (hoverDepId || departamentoSel)) && (
          <HoverInfo
            dataset={dataset}
            nivel={nivel}
            provinciaId={nivel === "pais" ? hoverProvId : provinciaSel}
            departamentoId={nivel === "provincia" ? (departamentoSel ?? hoverDepId) : null}
            delitoId={delitoId}
            anio={anio}
            metric={metric}
          />
        )}

        {/* Botones */}
        <div className="absolute bottom-4 right-4 flex gap-2">
          {nivel === "provincia" && (
            <button
              onClick={() => reset()}
              className="rounded-md border border-emerald-500/60 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/30 hover:text-white"
            >
              ↺ Volver al país
            </button>
          )}
        </div>

        {/* Loading overlay */}
        {loadingProv && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0a1220]/40 backdrop-blur-sm">
            <div className="rounded-md border border-emerald-500/40 bg-[#0a1220]/90 px-4 py-2 text-[11px] font-medium text-emerald-200">
              Cargando provincia…
            </div>
          </div>
        )}

        {/* Breadcrumb */}
        <div className="absolute left-4 bottom-4 rounded-md border border-emerald-900/40 bg-[#0a1220]/90 px-3 py-1.5 text-[11px] text-emerald-300/85">
          <button
            onClick={() => reset()}
            className={nivel === "pais" ? "font-semibold text-white" : "underline-offset-2 hover:underline"}
          >
            Argentina
          </button>
          {provinciaSel && dataset && (
            <>
              <span className="mx-1.5 text-emerald-300/40">›</span>
              <span className="font-semibold text-white">
                {dataset.provincias.find((p) => p.id === provinciaSel)?.nombre}
              </span>
            </>
          )}
          {departamentoSel && dataset && (
            <>
              <span className="mx-1.5 text-emerald-300/40">›</span>
              <span className="font-semibold text-white">
                {dataset.departamentos.find((d) => d.id === departamentoSel)?.nombre}
              </span>
            </>
          )}
        </div>
      </div>

      <p className="text-[12px] leading-relaxed text-ink-3">
        <strong>Lectura:</strong> en la vista país cada hexágono se colorea y eleva según la métrica
        de su <em>provincia</em>. Al hacer click sobre una provincia el mapa hace zoom y carga un
        hexgrid más fino donde la métrica se refleja por <em>departamento</em>. La paleta cromática
        se calcula por percentil para mantener contraste aun con distribuciones sesgadas.
      </p>
    </div>
  );
}

/* ====================  Helpers  ==================== */

function bboxOf(feature: GeoJSON.Feature): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (c: any) => {
    if (typeof c[0] === "number") {
      if (c[0] < minX) minX = c[0];
      if (c[0] > maxX) maxX = c[0];
      if (c[1] < minY) minY = c[1];
      if (c[1] > maxY) maxY = c[1];
    } else c.forEach(walk);
  };
  walk((feature.geometry as any).coordinates);
  return [minX, minY, maxX, maxY];
}

function enrichHexgrid(
  fc: GeoJSON.FeatureCollection,
  getValue: (props: HexProps) => number,
): GeoJSON.FeatureCollection {
  const MAX_HEIGHT = 90000; // unidades del mapa (proyección Mercator)
  const rawValues = fc.features.map((f) => getValue(f.properties as HexProps));
  let globalMax = 0;
  for (const v of rawValues) if (v > globalMax) globalMax = v;
  const positives = rawValues.filter((v) => v > 0).slice().sort((a, b) => a - b);
  const N = positives.length;
  const percentileOf = (v: number): number => {
    if (v <= 0 || N === 0) return 0;
    let lo = 0, hi = N;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (positives[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo / N;
  };
  const features = fc.features.map((f, i) => {
    const v = rawValues[i];
    const linear = globalMax > 0 ? v / globalMax : 0;
    const visualH = Math.pow(linear, 0.4);
    const intensity = percentileOf(v);
    const p = f.properties as HexProps;
    return {
      type: "Feature" as const,
      geometry: f.geometry,
      properties: {
        provincia_id: p.provincia_id,
        departamento_id: p.departamento_id ?? null,
        value: v,
        intensity,
        height: v > 0 ? Math.max(800, visualH * MAX_HEIGHT) : 0,
      },
    };
  });
  return { type: "FeatureCollection", features };
}

function colorInterpolate(): any {
  return [
    "interpolate", ["linear"], ["get", "intensity"],
    0, "#062a1f",
    0.15, "#007956",
    0.35, "#00bb7f",
    0.55, "#edb200",
    0.75, "#f97316",
    0.9, "#dc2626",
    1, "#7f1d1d",
  ];
}

function HoverInfo({
  dataset, nivel, provinciaId, departamentoId, delitoId, anio, metric,
}: {
  dataset: Dataset;
  nivel: "pais" | "provincia";
  provinciaId: string | null;
  departamentoId: string | null;
  delitoId: string;
  anio: number;
  metric: Metric;
}) {
  const ai = dataset.anios.indexOf(anio);
  const isAll = delitoId === "all";
  const di = isAll ? -1 : dataset.delitos.findIndex((d) => d.id === delitoId);
  if (ai < 0) return null;

  let nombre = "";
  let val = 0;
  let secondaryLabel = "";

  if (nivel === "pais" && provinciaId) {
    const pi = dataset.provincias.findIndex((p) => p.id === provinciaId);
    if (pi < 0) return null;
    nombre = dataset.provincias[pi].nombre;
    val = isAll
      ? totalProvincia(dataset, pi, ai, metric)
      : valorProvincia(dataset, pi, di, ai, metric);
    secondaryLabel = "Provincia";
  } else if (nivel === "provincia" && departamentoId) {
    const di2 = dataset.departamentos.findIndex((d) => d.id === departamentoId);
    if (di2 < 0) return null;
    nombre = dataset.departamentos[di2].nombre;
    val = isAll
      ? totalDepartamento(dataset, di2, ai, metric)
      : valorDepartamento(dataset, di2, di, ai, metric);
    secondaryLabel = "Departamento";
  } else {
    return null;
  }

  const labelDelito = isAll ? "Todos los delitos" : dataset.delitos[di]?.nombre;
  const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: metric === "tasa" ? 1 : 0 });
  const unidad = metric === "tasa" ? " /100k" : " hechos";

  return (
    <div className="pointer-events-none absolute right-4 top-4 w-[240px] rounded-lg border border-emerald-900/40 bg-[#0a1220]/92 p-3 shadow-float backdrop-blur">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-emerald-400">
        {secondaryLabel}
      </div>
      <div className="mt-0.5 text-[14px] font-semibold text-white">{nombre}</div>
      <div className="mt-2 text-[11px] text-emerald-300/70">{labelDelito} · {anio}</div>
      <div className="mt-1 text-[17px] font-semibold text-white num">
        {fmt(val)}<span className="text-[11px] text-emerald-300/70">{unidad}</span>
      </div>
    </div>
  );
}
