"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MapGL, {
  Layer,
  NavigationControl,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
import { useDashboard } from "@/lib/store";
import { valorDepartamento, totalNacional, totalDepartamento } from "@/lib/analytics";
import { loadPaisGeojson, loadDepartamentosAll } from "@/lib/data";
import { computeIsobands } from "@/lib/isobands";
import type { Dataset, Metric } from "@/lib/types";

const BASE_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";

// Paleta Cinder — sequential editorial (sin traffic-light, sin neón).
const CINDER = [
  "#1a1d24", "#3a2a3f", "#6e2a4a", "#b03a48", "#e8743a", "#f4c95d",
];

const ARG_BBOX: [number, number, number, number] = [-74, -55.2, -53.5, -21.7];

type Vista3DPaisProps = { onMapReady?: () => void };

export default function Vista3DPais({ onMapReady }: Vista3DPaisProps = {}) {
  const {
    dataset, departamentoSel,
    delitoId, anio, metric,
    setDelito, setAnio, setMetric, selectDepartamento,
  } = useDashboard();

  const [paisGeo, setPaisGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [depsGeo, setDepsGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [hoverDepId, setHoverDepId] = useState<string | null>(null);
  const mapRef = useRef<MapRef | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Cargas iniciales
  useEffect(() => {
    loadPaisGeojson().then(setPaisGeo).catch(console.error);
    loadDepartamentosAll().then(setDepsGeo).catch(console.error);
  }, []);

  // Resize defensivo
  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const tick = () => mapRef.current?.getMap()?.resize();
    const obs = new ResizeObserver(tick);
    obs.observe(el);
    const iv = setInterval(tick, 300);
    const stop = setTimeout(() => clearInterval(iv), 3000);
    return () => { obs.disconnect(); clearInterval(iv); clearTimeout(stop); };
  }, [depsGeo]);

  // Camera: vuelve al país cuando deselecciona
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !depsGeo) return;
    if (departamentoSel) {
      const feat = depsGeo.features.find((f) => (f.properties as any)?.departamento_id === departamentoSel);
      if (feat) {
        const c = (feat.properties as any).centroid as [number, number] | undefined;
        if (c) {
          map.easeTo({
            center: c, zoom: 7, pitch: 35, bearing: 0,
            duration: 1200, easing: (t) => 1 - Math.pow(1 - t, 3),
          });
        }
      }
    } else {
      map.easeTo({
        center: [-63.5, -38.5], zoom: 3.7, pitch: 0, bearing: 0,
        duration: 1200, easing: (t) => 1 - Math.pow(1 - t, 3),
      });
    }
  }, [departamentoSel, depsGeo]);

  // Índices
  const ai = useMemo(() => (dataset ? dataset.anios.indexOf(anio) : -1), [dataset, anio]);
  const di = useMemo(() => {
    if (!dataset) return -1;
    if (delitoId === "all") return -1;
    return dataset.delitos.findIndex((d) => d.id === delitoId);
  }, [dataset, delitoId]);

  // Valor por departamento → para choropleth + isobands
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

  // Choropleth: enrich the deps geojson con value + intensity (percentile)
  const depsEnriched = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!depsGeo || valoresDep.size === 0) return null;
    const values = depsGeo.features.map((f) => valoresDep.get((f.properties as any).departamento_id) ?? 0);
    const positives = values.filter((v) => v > 0).slice().sort((a, b) => a - b);
    const N = positives.length;
    const pct = (v: number) => {
      if (v <= 0 || N === 0) return 0;
      let lo = 0, hi = N;
      while (lo < hi) {
        const m = (lo + hi) >>> 1;
        if (positives[m] < v) lo = m + 1; else hi = m;
      }
      return lo / N;
    };
    const features = depsGeo.features.map((f, i) => ({
      type: "Feature" as const,
      geometry: f.geometry,
      properties: {
        ...(f.properties ?? {}),
        value: values[i],
        intensity: pct(values[i]),
      },
    }));
    return { type: "FeatureCollection", features };
  }, [depsGeo, valoresDep]);

  // Isobands halo (IDW sobre centroides + turf.isobands)
  const isobandsFC = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!depsGeo || valoresDep.size === 0) return null;
    const points = depsGeo.features
      .map((f) => {
        const props = f.properties as any;
        const c = props?.centroid as [number, number] | undefined;
        const id = props?.departamento_id as string;
        if (!c) return null;
        const v = valoresDep.get(id) ?? 0;
        return { lon: c[0], lat: c[1], v };
      })
      .filter((x): x is { lon: number; lat: number; v: number } => x !== null);
    try {
      return computeIsobands(points, ARG_BBOX);
    } catch (e) {
      console.error("isobands error", e);
      return null;
    }
  }, [depsGeo, valoresDep]);

  // ESC para deseleccionar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && departamentoSel) selectDepartamento(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [departamentoSel, selectDepartamento]);

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
    <div ref={wrapperRef} className="fixed inset-0 overflow-hidden" style={{ background: "#0e1014" }}>
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: -63.5, latitude: -38.5, zoom: 3.7, pitch: 0, bearing: 0 }}
        mapStyle={BASE_STYLE}
        minZoom={3}
        maxZoom={11}
        maxPitch={50}
        dragRotate={false}
        touchPitch={false}
        onMouseMove={(e) => {
          const f = e.features?.[0];
          setHoverDepId(f ? ((f.properties?.departamento_id as string) ?? null) : null);
        }}
        onMouseLeave={() => setHoverDepId(null)}
        onClick={(e) => {
          const f = e.features?.[0];
          const id = (f?.properties?.departamento_id as string) ?? null;
          if (!id) {
            if (departamentoSel) selectDepartamento(null);
            return;
          }
          selectDepartamento(id === departamentoSel ? null : id);
        }}
        interactiveLayerIds={["deps-fill"]}
        onLoad={() => {
          const m = mapRef.current?.getMap();
          if (!m || !onMapReady) return;
          const once = () => { m.off("idle", once); onMapReady(); };
          m.on("idle", once);
        }}
        style={{ height: "100%", width: "100%", background: "#0e1014" }}
        cursor={hoverDepId ? "pointer" : "default"}
      >
        <NavigationControl position="bottom-left" visualizePitch={false} showCompass={false} showZoom />

        {/* Capa 1 — Isobands halo (continuo, blurred, 22% opacity) */}
        {isobandsFC && (
          <Source id="isobands" type="geojson" data={isobandsFC}>
            <Layer
              id="isobands-fill"
              type="fill"
              paint={{
                "fill-color": [
                  "interpolate", ["linear"], ["get", "intensity"],
                  0,   CINDER[0],
                  0.2, CINDER[1],
                  0.4, CINDER[2],
                  0.6, CINDER[3],
                  0.8, CINDER[4],
                  1,   CINDER[5],
                ],
                "fill-opacity": 0.28,
                "fill-antialias": true,
              }}
            />
          </Source>
        )}

        {/* Capa 2 — Choropleth de los 555 departamentos */}
        {depsEnriched && (
          <Source id="deps" type="geojson" data={depsEnriched}>
            <Layer
              id="deps-fill"
              type="fill"
              paint={{
                "fill-color": [
                  "interpolate", ["linear"], ["get", "intensity"],
                  0,   CINDER[0],
                  0.2, CINDER[1],
                  0.4, CINDER[2],
                  0.6, CINDER[3],
                  0.8, CINDER[4],
                  1,   CINDER[5],
                ],
                "fill-opacity": [
                  "case",
                  ["==", ["get", "departamento_id"], departamentoSel ?? "__none__"], 1,
                  ["==", ["get", "departamento_id"], hoverDepId ?? "__none__"], 0.94,
                  0.82,
                ],
              }}
            />
            <Layer
              id="deps-border"
              type="line"
              paint={{
                "line-color": "#1f2329",
                "line-width": 0.5,
                "line-opacity": 0.9,
              }}
            />
            {/* Highlight stroke para hover/select */}
            <Layer
              id="deps-stroke-active"
              type="line"
              paint={{
                "line-color": [
                  "case",
                  ["==", ["get", "departamento_id"], departamentoSel ?? "__none__"], "#fef3c7",
                  ["==", ["get", "departamento_id"], hoverDepId ?? "__none__"], "#f4c95d",
                  "rgba(0,0,0,0)",
                ],
                "line-width": [
                  "case",
                  ["==", ["get", "departamento_id"], departamentoSel ?? "__none__"], 2,
                  ["==", ["get", "departamento_id"], hoverDepId ?? "__none__"], 1.4,
                  0,
                ],
                "line-opacity": 1,
              }}
            />
          </Source>
        )}

        {/* Capa 3 — Province outlines como guía sutil (no interactiva) */}
        {paisGeo && (
          <Source id="prov-outline" type="geojson" data={paisGeo}>
            <Layer
              id="prov-line"
              type="line"
              paint={{
                "line-color": "#3a4452",
                "line-width": 0.8,
                "line-opacity": 0.5,
              }}
            />
          </Source>
        )}

        {/* Capa 4 — Extrusion selectiva: sólo el departamento seleccionado */}
        {depsEnriched && departamentoSel && (
          <Source id="dep-selected" type="geojson" data={{
            type: "FeatureCollection",
            features: depsEnriched.features.filter((f) => (f.properties as any).departamento_id === departamentoSel),
          }}>
            <Layer
              id="dep-selected-extrusion"
              type="fill-extrusion"
              paint={{
                "fill-extrusion-color": "#f4c95d",
                "fill-extrusion-height": 30000,
                "fill-extrusion-base": 0,
                "fill-extrusion-opacity": 0.55,
                "fill-extrusion-vertical-gradient": true,
              }}
            />
          </Source>
        )}
      </MapGL>

      {/* === Header === */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30">
        <div className="pointer-events-auto mx-auto flex max-w-[1480px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3 rounded-full border border-white/8 bg-black/40 px-4 py-1.5 backdrop-blur-md">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inset-0 rounded-full bg-amber-300 halo-expand" />
              <span className="absolute inset-0 rounded-full bg-amber-300" />
            </span>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/85">
              Colossus Lab
            </span>
            <span className="h-3 w-px bg-white/15" />
            <span className="text-[10.5px] uppercase tracking-[0.22em] text-white/55">
              Observatorio · Seguridad
            </span>
          </div>
          <nav className="flex items-center gap-2">
            <a href="https://www.colossuslab.org" target="_blank" rel="noreferrer" className="rounded-full border border-white/8 bg-black/40 px-3.5 py-1.5 text-[10.5px] uppercase tracking-[0.18em] text-white/65 backdrop-blur-md transition hover:text-white">
              colossuslab.org
            </a>
            <a href="https://www.argentina.gob.ar/seguridad/estadisticascriminales" target="_blank" rel="noreferrer" className="rounded-full border border-white/8 bg-black/40 px-3.5 py-1.5 text-[10.5px] uppercase tracking-[0.18em] text-white/65 backdrop-blur-md transition hover:text-white">
              Fuente SNIC ↗
            </a>
          </nav>
        </div>
      </div>

      {/* === Headline editorial (izquierda) === */}
      <div className="pointer-events-none absolute left-8 top-[88px] z-20 max-w-[480px] anim-fade-up">
        <div className="text-[10.5px] uppercase tracking-[0.24em] text-amber-300/80">
          Open Arg · SNIC · {dataset.anios[0]}–{dataset.anios[dataset.anios.length - 1]}
        </div>
        <h1 className="mt-3 headline text-[44px] leading-[1.02] tracking-[-0.012em] text-white md:text-[52px]">
          Mapa de inseguridad
          <span className="block text-white/55">República Argentina</span>
        </h1>
        <p className="mt-3 max-w-md text-[13px] leading-snug text-white/55">
          {dataset.provincias.length} provincias · {dataset.departamentos.length} departamentos ·{" "}
          {dataset.delitos.length} categorías SNIC · serie {dataset.anios.length} años.
        </p>
      </div>

      {/* === Legend === */}
      <div className="pointer-events-none absolute right-8 top-[88px] z-20 w-[260px] rounded-xl border border-white/8 bg-black/55 px-4 py-3.5 backdrop-blur-md anim-fade-up">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300/85">
          {delitoNombre}
        </div>
        <div className="mt-1 text-[11px] text-white/55 mono num">
          {anio} · {metric === "tasa" ? "tasa /100k hab." : "hechos absolutos"}
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{
          background: `linear-gradient(90deg, ${CINDER.join(", ")})`,
        }} />
        <div className="mt-1.5 flex justify-between text-[9.5px] uppercase tracking-[0.16em] text-white/40 num">
          <span>min</span><span>mediana</span><span>max</span>
        </div>
        <div className="mt-2 text-[10px] leading-snug text-white/45">
          Color por percentil — escala perceptual robusta a outliers.
        </div>
      </div>

      {/* === Hover / Selected card === */}
      {((hoverDepId || departamentoSel) && dataset && depsGeo) && (
        <DetailCard
          dataset={dataset}
          depsGeo={depsGeo}
          depId={departamentoSel ?? hoverDepId!}
          pinned={!!departamentoSel}
          delitoId={delitoId}
          anio={anio}
          metric={metric}
          onClear={() => selectDepartamento(null)}
        />
      )}

      {/* === Bottom filter panel === */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 pb-6">
        <div className="pointer-events-auto mx-auto max-w-[1080px] px-6">
          <div className="rounded-2xl border border-white/8 bg-black/55 px-5 py-4 backdrop-blur-md anim-fade-up">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-5">
                <div>
                  <div className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-amber-300/85">Categoría · {anio}</div>
                  <div className="mt-0.5 text-[20px] font-semibold leading-none tracking-tight text-white num">
                    {totalSel.toLocaleString("es-AR")}
                  </div>
                </div>
                <div className="h-9 w-px bg-white/15" />
                <div>
                  <div className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/45">Total agregado</div>
                  <div className="mt-0.5 text-[14px] text-white/75 num">
                    {totalAll.toLocaleString("es-AR")}
                    <span className="text-white/45"> hechos</span>
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-white/45">
                {departamentoSel ? "ESC o click vacío para deseleccionar" : "Click un departamento para ver el detalle"}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)] md:items-end">
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/55">Tipo de delito</span>
                <select
                  value={delitoId}
                  onChange={(e) => setDelito(e.target.value)}
                  className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-white outline-none focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/20"
                >
                  <option value="all">— Todos los delitos (suma SNIC) —</option>
                  {dataset.delitos.map((d) => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/55">Métrica</span>
                <div className="inline-flex overflow-hidden rounded-md border border-white/10 bg-black/30">
                  {(["tasa", "hechos"] as const).map((m, i) => (
                    <button
                      key={m}
                      onClick={() => setMetric(m)}
                      className={[
                        "press-feedback px-4 py-2 text-[12px] font-medium transition",
                        i === 0 ? "border-r border-white/10" : "",
                        metric === m ? "bg-amber-300 text-black" : "text-white/65 hover:text-white",
                      ].join(" ")}
                    >
                      {m === "tasa" ? "Tasa /100k" : "Hechos"}
                    </button>
                  ))}
                </div>
              </label>

              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="flex items-baseline justify-between">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/55">Año</span>
                  <span className="mono num text-[12px] font-semibold text-white">{anio}</span>
                </span>
                <div className="relative pt-6">
                  <div
                    className="slider-tooltip"
                    style={{
                      left: `${((anio - dataset.anios[0]) / (dataset.anios[dataset.anios.length - 1] - dataset.anios[0])) * 100}%`,
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
                  <div className="mt-0.5 flex justify-between text-[9.5px] text-white/35 mono num">
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

function DetailCard({
  dataset, depsGeo, depId, pinned, delitoId, anio, metric, onClear,
}: {
  dataset: Dataset;
  depsGeo: GeoJSON.FeatureCollection;
  depId: string;
  pinned: boolean;
  delitoId: string;
  anio: number;
  metric: Metric;
  onClear: () => void;
}) {
  const dep = dataset.departamentos.find((d) => d.id === depId);
  const depFeat = depsGeo.features.find((f) => (f.properties as any).departamento_id === depId);
  const prov = dep ? dataset.provincias.find((p) => p.id === dep.provincia_id) : null;
  const ai = dataset.anios.indexOf(anio);
  const isAll = delitoId === "all";
  const di = isAll ? -1 : dataset.delitos.findIndex((d) => d.id === delitoId);
  if (!dep || ai < 0) return null;
  const depIdx = dataset.departamentos.indexOf(dep);
  const val = isAll
    ? totalDepartamento(dataset, depIdx, ai, metric)
    : valorDepartamento(dataset, depIdx, di, ai, metric);
  const labelDelito = isAll ? "Todos los delitos" : dataset.delitos[di]?.nombre;
  const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: metric === "tasa" ? 1 : 0 });
  const unidad = metric === "tasa" ? " /100k" : " hechos";
  void depFeat;

  return (
    <div className="pointer-events-none absolute right-8 top-[260px] z-20 w-[300px] rounded-xl border border-amber-300/30 bg-black/65 px-4 py-4 backdrop-blur-md anim-fade-up">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[9.5px] uppercase tracking-[0.18em] text-amber-300/80">
            {pinned ? "Departamento seleccionado" : "Departamento"}
          </div>
          <div className="mt-1 headline text-[20px] leading-tight text-white">{dep.nombre}</div>
          <div className="mt-0.5 text-[11px] text-white/55">{prov?.nombre}</div>
        </div>
        {pinned && (
          <button
            onClick={onClear}
            className="pointer-events-auto rounded-md border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/55 transition hover:text-white"
          >
            ✕
          </button>
        )}
      </div>
      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="text-[10.5px] text-white/55">{labelDelito} · {anio}</div>
        <div className="mt-1 text-[28px] font-semibold leading-none text-white num">
          {fmt(val)}<span className="text-[11px] font-normal text-white/55">{unidad}</span>
        </div>
      </div>
    </div>
  );
}
