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

type HexProps = { provincia_id: string; departamento_id: string | null; n?: number[] };

type Vista3DPaisProps = {
  onMapReady?: () => void;
};

export default function Vista3DPais({ onMapReady }: Vista3DPaisProps = {}) {
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

  // FlyTo a la provincia seleccionada — secuencia cinematográfica en dos fases.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !paisGeo) return;
    const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
    if (provinciaSel) {
      const prov = paisGeo.features.find((f) => f.properties?.provincia_id === provinciaSel);
      if (prov) {
        const bbox = bboxOf(prov);
        const cx = (bbox[0] + bbox[2]) / 2;
        const cy = (bbox[1] + bbox[3]) / 2;
        // Fase 1: pull-back con tilt fuerte y rotación
        map.easeTo({
          center: [cx, cy],
          zoom: Math.max(map.getZoom() - 0.6, 3.4),
          pitch: viewMode === "3d" ? 72 : 0,
          bearing: -28,
          duration: 380,
          easing: (t) => t * t,
        });
        // Fase 2: fitBounds dramático
        setTimeout(() => {
          map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
            padding: 60, pitch: viewMode === "3d" ? 62 : 0, bearing: -12, duration: 1500,
            easing: easeOutQuart, maxZoom: 12,
          });
        }, 380);
      }
    } else {
      // Volver al país en dos fases (zoom-in→reset)
      map.easeTo({
        zoom: map.getZoom() + 0.4, pitch: viewMode === "3d" ? 72 : 0, bearing: 12, duration: 320,
        easing: (t) => t * t,
      });
      setTimeout(() => {
        map.easeTo({
          center: [-63.5, -38.5], zoom: 3.9,
          pitch: viewMode === "3d" ? 62 : 0, bearing: -6, duration: 1400,
          easing: easeOutQuart,
        });
      }, 320);
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
    return enrichHexgrid(hexProv, (p) => valoresDep.get(p.departamento_id ?? "") ?? 0, false);
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
    <div ref={wrapperRef} className="fixed inset-0 overflow-hidden map-grain map-vignette" style={{ background: "#050a14" }}>
        <MapGL
          ref={mapRef}
          initialViewState={{
            longitude: -63.5,
            latitude: -38.5,
            zoom: 3.9,
            pitch: 62,
            bearing: -6,
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
          onLoad={() => {
            const m = mapRef.current?.getMap();
            if (!m || !onMapReady) return;
            // Esperamos el primer 'idle' (mapa con todos los tiles + extrusiones renderizadas).
            const once = () => {
              m.off("idle", once);
              onMapReady();
            };
            m.on("idle", once);
          }}
          style={{ height: "100%", width: "100%", background: "#050a14" }}
        >
          <NavigationControl position="bottom-left" visualizePitch showCompass showZoom />

          {/* Tech grid sutil tipo blueprint */}
          <Source id="tech-grid" type="geojson" data={buildTechGrid()}>
            <Layer
              id="tech-grid-line"
              type="line"
              paint={{
                "line-color": "#00bb7f",
                "line-opacity": 0.05,
                "line-width": 0.7,
              }}
            />
          </Source>

          {/* === Vista país === */}
          {nivel === "pais" && paisGeo && (
            <Source id="prov-outline" type="geojson" data={paisGeo}>
              <Layer
                id="prov-fill-bg"
                type="fill"
                paint={{ "fill-color": "#0a1422", "fill-opacity": 0.5 }}
              />
              {/* Glow exterior ancho */}
              <Layer
                id="prov-line-glow-outer"
                type="line"
                paint={{ "line-color": "#00d294", "line-width": 8, "line-opacity": 0.08, "line-blur": 4 }}
              />
              <Layer
                id="prov-line-glow"
                type="line"
                paint={{ "line-color": "#00bb7f", "line-width": 3.5, "line-opacity": 0.22, "line-blur": 1.5 }}
              />
              <Layer
                id="prov-line"
                type="line"
                paint={{
                  "line-color": [
                    "case",
                    ["==", ["get", "provincia_id"], hoverProvId ?? "__none__"], "#7fffd4",
                    "#00d294",
                  ],
                  "line-width": [
                    "case",
                    ["==", ["get", "provincia_id"], hoverProvId ?? "__none__"], 2.2,
                    1.1,
                  ],
                  "line-opacity": 0.95,
                }}
              />
            </Source>
          )}

          {nivel === "pais" && hexPaisEnriched && (
            <Source id="hex-pais" type="geojson" data={hexPaisEnriched}>
              {/* Glow ground layer (halo emisor proyectado sobre el suelo) */}
              <Layer
                id="hex-pais-ground-glow"
                type="fill"
                paint={{
                  "fill-color": colorInterpolate(),
                  "fill-opacity": 0.22,
                  "fill-antialias": true,
                }}
              />
              {viewMode === "3d" ? (
                <Layer
                  id="hex-pais-3d"
                  type="fill-extrusion"
                  paint={{
                    "fill-extrusion-height": [
                      "case",
                      ["==", ["get", "provincia_id"], hoverProvId ?? "__none__"],
                      ["*", ["get", "height"], 1.15],
                      ["get", "height"],
                    ],
                    "fill-extrusion-base": 0,
                    "fill-extrusion-color": colorInterpolate(),
                    "fill-extrusion-opacity": 0.55,
                    "fill-extrusion-vertical-gradient": true,
                  }}
                />
              ) : (
                <Layer
                  id="hex-pais-2d"
                  type="fill"
                  paint={{
                    "fill-color": colorInterpolate(),
                    "fill-opacity": [
                      "case",
                      ["==", ["get", "provincia_id"], hoverProvId ?? "__none__"], 0.95,
                      0.85,
                    ],
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
              {/* Ground glow para la provincia también */}
              <Layer
                id="hex-prov-ground-glow"
                type="fill"
                paint={{
                  "fill-color": colorInterpolate(),
                  "fill-opacity": 0.2,
                  "fill-antialias": true,
                }}
              />
              {viewMode === "3d" ? (
                <Layer
                  id="hex-prov-3d"
                  type="fill-extrusion"
                  paint={{
                    "fill-extrusion-height": ["get", "height"],
                    "fill-extrusion-base": 0,
                    "fill-extrusion-color": colorInterpolate(),
                    "fill-extrusion-opacity": 0.6,
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
        <div className="pointer-events-none absolute left-6 top-[72px] z-10 w-[300px] rounded-xl glass-card p-3.5 anim-fade-up">
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
            background: "linear-gradient(90deg, #063d3f 0%, #0a98a8 16%, #22e7e0 32%, #7ef0c2 50%, #fde047 66%, #fb923c 80%, #f43f5e 92%, #c026d3 100%)",
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


        {/* Loading overlay */}
        {loadingProv && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#0a1220]/35 backdrop-blur-sm">
            <div className="flex items-center gap-2.5 rounded-xl glass-card px-4 py-2.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 pulse-dot" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                Cargando provincia
              </span>
            </div>
          </div>
        )}

        {/* Breadcrumb */}
        <div className="absolute left-1/2 top-[80px] z-20 -translate-x-1/2 rounded-full glass-card px-4 py-2 text-[11.5px] text-emerald-300/90 anim-fade-up flex items-center gap-2">
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
          {nivel === "provincia" && (
            <button
              onClick={() => reset()}
              className="press-feedback ml-2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200 transition hover:bg-emerald-500/30 hover:text-white"
              title="Volver al país"
            >
              ↺ país
            </button>
          )}
        </div>

      {/* === Header flotante === */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30">
        <div className="pointer-events-auto mx-auto flex max-w-[1480px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3 rounded-full glass-card px-4 py-1.5">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inset-0 rounded-full bg-emerald-500 halo-expand" />
              <span className="absolute inset-0 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/90">
              Colossus Lab
            </span>
            <span className="h-3 w-px bg-emerald-400/30" />
            <span className="text-[10.5px] uppercase tracking-[0.22em] text-emerald-300/80">
              Observatorio · Seguridad
            </span>
          </div>
          <nav className="flex items-center gap-2">
            <a
              href="https://www.colossuslab.org"
              target="_blank"
              rel="noreferrer"
              className="rounded-full glass-card px-3.5 py-1.5 text-[10.5px] uppercase tracking-[0.18em] text-white/80 transition hover:text-white"
            >
              colossuslab.org
            </a>
            <a
              href="https://www.argentina.gob.ar/seguridad/estadisticascriminales"
              target="_blank"
              rel="noreferrer"
              className="rounded-full glass-card px-3.5 py-1.5 text-[10.5px] uppercase tracking-[0.18em] text-white/80 transition hover:text-white"
            >
              Fuente SNIC ↗
            </a>
          </nav>
        </div>

        {/* KPI chip top-right */}
        <div className="pointer-events-none absolute right-6 top-[72px]">
          <div className="rounded-xl glass-card px-4 py-3 anim-fade-up">
            <div className="eyebrow text-emerald-400/90">Mapa de inseguridad · Argentina</div>
            <div className="mt-1.5 flex items-baseline gap-3 num">
              <Kpi big={dataset.provincias.length} suffix="prov." />
              <span className="text-emerald-400/30">·</span>
              <Kpi big={dataset.departamentos.length} suffix="deps." />
              <span className="text-emerald-400/30">·</span>
              <Kpi big={dataset.delitos.length} suffix="delitos" />
              <span className="text-emerald-400/30">·</span>
              <Kpi big={`${dataset.anios[0]}–${dataset.anios[dataset.anios.length - 1]}`} suffix="años" mono />
            </div>
          </div>
        </div>
      </div>

      {/* === Panel de filtros flotante (bottom) === */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 pb-6">
        <div className="pointer-events-auto mx-auto max-w-[1080px] px-6">
          <div className="rounded-2xl glass-card px-5 py-4 anim-fade-up">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-4">
                <div>
                  <div className="eyebrow text-emerald-400/90">Total · {anio}</div>
                  <div className="mt-0.5 text-[20px] font-semibold leading-none tracking-tight text-white num">
                    {totalSel.toLocaleString("es-AR")}
                  </div>
                </div>
                <div className="h-9 w-px bg-emerald-400/20" />
                <div>
                  <div className="eyebrow text-emerald-400/90">Total agregado</div>
                  <div className="mt-0.5 text-[14px] text-white/80 num">
                    {totalAll.toLocaleString("es-AR")}
                    <span className="text-emerald-300/60"> hechos</span>
                  </div>
                </div>
              </div>
              <div className="inline-flex overflow-hidden rounded-md border border-emerald-400/30 bg-[#0a1422]/60">
                {(["2d", "3d"] as const).map((m, i) => (
                  <button
                    key={m}
                    onClick={() => setViewMode(m)}
                    className={[
                      "press-feedback px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider transition",
                      i === 0 ? "border-r border-emerald-400/30" : "",
                      viewMode === m ? "bg-emerald-500 text-[#0a1220]" : "text-emerald-200/75 hover:text-white",
                    ].join(" ")}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)] md:items-end">
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="eyebrow text-emerald-400/90">Tipo de delito</span>
                <select
                  value={delitoId}
                  onChange={(e) => setDelito(e.target.value)}
                  className="rounded-md border border-emerald-400/30 bg-[#0a1422]/70 px-3 py-2 text-[13px] text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="all">— Todos los delitos (suma SNIC) —</option>
                  {dataset.delitos.map((d) => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="eyebrow text-emerald-400/90">Métrica</span>
                <div className="inline-flex overflow-hidden rounded-md border border-emerald-400/30 bg-[#0a1422]/70">
                  {(["tasa", "hechos"] as const).map((m, i) => (
                    <button
                      key={m}
                      onClick={() => setMetric(m)}
                      className={[
                        "press-feedback px-4 py-2 text-[12px] font-medium transition",
                        i === 0 ? "border-r border-emerald-400/30" : "",
                        metric === m ? "bg-emerald-500 text-[#0a1220]" : "text-emerald-200/75 hover:text-white",
                      ].join(" ")}
                    >
                      {m === "tasa" ? "Tasa /100k" : "Hechos"}
                    </button>
                  ))}
                </div>
              </label>

              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="flex items-baseline justify-between">
                  <span className="eyebrow text-emerald-400/90">Año</span>
                  <span className="mono num text-[12px] font-semibold text-white">{anio}</span>
                </span>
                <div className="relative pt-6">
                  <div
                    className="slider-tooltip"
                    style={{
                      left: `${(
                        (anio - dataset.anios[0]) /
                        (dataset.anios[dataset.anios.length - 1] - dataset.anios[0])
                      ) * 100}%`,
                    }}
                  >
                    {anio}
                  </div>
                  <input
                    type="range"
                    min={dataset.anios[0]}
                    max={dataset.anios[dataset.anios.length - 1]}
                    step={1}
                    value={anio}
                    onChange={(e) => setAnio(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="mt-0.5 flex justify-between text-[9.5px] text-emerald-300/55 mono num">
                    <span>{dataset.anios[0]}</span>
                    <span>{dataset.anios[dataset.anios.length - 1]}</span>
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>

      </div>
  );
}

function Kpi({ big, suffix, mono = false }: { big: number | string; suffix: string; mono?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`text-[16px] font-semibold leading-none tracking-tight text-white ${mono ? "mono" : ""}`}>
        {big}
      </span>
      <span className="text-[10px] uppercase tracking-[0.16em] text-emerald-300/70">{suffix}</span>
    </span>
  );
}

/* ====================  Helpers  ==================== */

/** Tech grid líneas cada 1° (~110 km) sobre toda Argentina continental. */
function buildTechGrid(): GeoJSON.FeatureCollection {
  const minX = -74, maxX = -53, minY = -56, maxY = -21, step = 1;
  const features: GeoJSON.Feature[] = [];
  for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
    features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[x, minY], [x, maxY]] } });
  }
  for (let y = Math.ceil(minY / step) * step; y <= maxY; y += step) {
    features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[minX, y], [maxX, y]] } });
  }
  return { type: "FeatureCollection", features };
}

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
  smooth = true,
): GeoJSON.FeatureCollection {
  // Look "océano holográfico": amplitud moderada + smoothing también en altura.
  const MAX_HEIGHT = 420000;
  const rawValues = fc.features.map((f) => getValue(f.properties as HexProps));

  const blur = (input: number[]) => {
    const out = new Array(input.length);
    for (let i = 0; i < fc.features.length; i++) {
      const neighbors = ((fc.features[i].properties as HexProps).n) ?? [];
      const k = neighbors.length;
      if (k === 0) { out[i] = input[i]; continue; }
      let s = input[i] * 0.4;
      let wTotal = 0.4;
      const wEach = 0.6 / Math.max(1, k);
      for (const nIdx of neighbors) {
        s += input[nIdx] * wEach;
        wTotal += wEach;
      }
      out[i] = s / wTotal;
    }
    return out;
  };

  // Color: doble smoothing → gradiente súper suave entre provincias.
  // Altura: smoothing simple → suaviza los plateaus pero peaks siguen visibles.
  const colorValues = smooth ? blur(blur(rawValues)) : rawValues;
  const heightValues = smooth ? blur(rawValues) : rawValues;

  let heightMax = 0;
  for (const v of heightValues) if (v > heightMax) heightMax = v;

  const positives = colorValues.filter((v) => v > 0).slice().sort((a, b) => a - b);
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

  const MIN_FLOOR = 3000; // 3 km — baseline mínimo para que el "océano" tenga un piso continuo
  const features = fc.features.map((f, i) => {
    const vH = heightValues[i];
    const vC = colorValues[i];
    // pow 0.65 — compresión suave hacia arriba para look "wave"
    const linear = heightMax > 0 ? vH / heightMax : 0;
    const visualH = Math.pow(linear, 0.65);
    const intensity = percentileOf(vC);
    const p = f.properties as HexProps;
    return {
      type: "Feature" as const,
      geometry: f.geometry,
      properties: {
        provincia_id: p.provincia_id,
        departamento_id: p.departamento_id ?? null,
        value: vH,
        intensity,
        height: vH > 0 ? Math.max(MIN_FLOOR, visualH * MAX_HEIGHT) : 0,
      },
    };
  });
  return { type: "FeatureCollection", features };
}

function colorInterpolate(): any {
  // Paleta holográfica: deep teal → cyan neón → mint → amber → rose → magenta
  return [
    "interpolate", ["linear"], ["get", "intensity"],
    0,    "#063d3f",
    0.16, "#0a98a8",
    0.32, "#22e7e0",
    0.50, "#7ef0c2",
    0.66, "#fde047",
    0.80, "#fb923c",
    0.92, "#f43f5e",
    1,    "#c026d3",
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
    <div className="pointer-events-none absolute right-6 top-[160px] z-10 w-[260px] rounded-xl glass-card p-3.5 anim-fade-up">
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
