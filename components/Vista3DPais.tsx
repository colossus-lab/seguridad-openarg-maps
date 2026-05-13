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
  valorDepartamento, valorProvincia,
  totalNacional, totalDepartamento, totalProvincia,
  topNDelitosProvincia, topNDelitosDepartamento,
  serieProvincia, serieDepartamento, evolucion5Anios,
} from "@/lib/analytics";
import { loadPaisGeojson, loadDepartamentosAll, loadMask } from "@/lib/data";
import { computeIsobands } from "@/lib/isobands";
import type { Dataset, Metric } from "@/lib/types";

const BASE_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";

// Paleta Cinder editorial.
const CINDER = ["#1a1d24", "#3a2a3f", "#6e2a4a", "#b03a48", "#e8743a", "#f4c95d"];
const ARG_BBOX: [number, number, number, number] = [-74, -55.2, -53.5, -21.7];

type Vista3DPaisProps = { onMapReady?: () => void };

export default function Vista3DPais({ onMapReady }: Vista3DPaisProps = {}) {
  const {
    dataset, provinciaSel, departamentoSel,
    delitoId, anio, metric,
    setDelito, setAnio, setMetric,
    selectProvincia, selectDepartamento, reset,
  } = useDashboard();

  const [paisGeo, setPaisGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [depsGeo, setDepsGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [maskGeo, setMaskGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [hoverProvId, setHoverProvId] = useState<string | null>(null);
  const [hoverDepId, setHoverDepId] = useState<string | null>(null);
  const [viewState, setViewState] = useState({
    longitude: -63.5, latitude: -38.5, zoom: 3.7, pitch: 0, bearing: 0,
  });
  const mapRef = useRef<MapRef | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const nivel: "pais" | "provincia" = provinciaSel ? "provincia" : "pais";

  useEffect(() => {
    loadPaisGeojson().then(setPaisGeo).catch(console.error);
    loadDepartamentosAll().then(setDepsGeo).catch(console.error);
    loadMask().then(setMaskGeo).catch(console.error);
  }, []);

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
  }, [depsGeo]);

  // Camera transitions: provincia → zoom + tilt, depto → zoom más cerca, reset → país plano.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !paisGeo || !depsGeo) return;
    const easing = (t: number) => 1 - Math.pow(1 - t, 3);
    if (departamentoSel) {
      const f = depsGeo.features.find((x) => (x.properties as any).departamento_id === departamentoSel);
      const c = (f?.properties as any)?.centroid as [number, number] | undefined;
      if (c) {
        map.easeTo({ center: c, zoom: 7.2, pitch: 42, bearing: 0, duration: 1200, easing });
      }
    } else if (provinciaSel) {
      const prov = paisGeo.features.find((x) => (x.properties as any).provincia_id === provinciaSel);
      if (prov) {
        const bb = bboxOf(prov);
        map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], {
          padding: { top: 120, right: 360, bottom: 220, left: 120 },
          pitch: 48, bearing: 0, duration: 1400, easing, maxZoom: 7.5,
        });
      }
    } else {
      map.easeTo({
        center: [-63.5, -38.5], zoom: 3.7, pitch: 0, bearing: 0,
        duration: 1200, easing,
      });
    }
  }, [provinciaSel, departamentoSel, paisGeo, depsGeo]);

  // Datos.
  const ai = useMemo(() => (dataset ? dataset.anios.indexOf(anio) : -1), [dataset, anio]);
  const di = useMemo(() => {
    if (!dataset) return -1;
    if (delitoId === "all") return -1;
    return dataset.delitos.findIndex((d) => d.id === delitoId);
  }, [dataset, delitoId]);

  // Valor por departamento (choropleth principal).
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

  // Choropleth enriched.
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
      properties: { ...(f.properties ?? {}), value: values[i], intensity: pct(values[i]) },
    }));
    return { type: "FeatureCollection", features };
  }, [depsGeo, valoresDep]);

  // Isobands clipped to Argentina.
  const isobandsFC = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!depsGeo || valoresDep.size === 0) return null;
    const points = depsGeo.features
      .map((f) => {
        const props = f.properties as any;
        const c = props?.centroid as [number, number] | undefined;
        const id = props?.departamento_id as string;
        if (!c) return null;
        return { lon: c[0], lat: c[1], v: valoresDep.get(id) ?? 0 };
      })
      .filter((x): x is { lon: number; lat: number; v: number } => x !== null);
    try {
      return computeIsobands(points, ARG_BBOX, paisGeo ?? undefined);
    } catch (e) { console.error("isobands error", e); return null; }
  }, [depsGeo, valoresDep, paisGeo]);

  // Valor por provincia (para 3D selectiva + HUD).
  const valoresProv = useMemo(() => {
    if (!dataset || ai < 0) return new Map<string, number>();
    const m = new Map<string, number>();
    dataset.provincias.forEach((p, idx) => {
      const v = di < 0
        ? totalProvincia(dataset, idx, ai, metric)
        : valorProvincia(dataset, idx, di, ai, metric);
      m.set(p.id, v);
    });
    return m;
  }, [dataset, ai, di, metric]);

  // Provincia seleccionada → polígono con altura proporcional para el extrusion editorial.
  const provExtrusionFC = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!paisGeo || !provinciaSel || valoresProv.size === 0) return null;
    const f = paisGeo.features.find((x) => (x.properties as any).provincia_id === provinciaSel);
    if (!f) return null;
    const v = valoresProv.get(provinciaSel) ?? 0;
    let max = 0;
    valoresProv.forEach((x) => { if (x > max) max = x; });
    const norm = max > 0 ? v / max : 0;
    const height = Math.max(40000, Math.pow(norm, 0.6) * 220000);
    return {
      type: "FeatureCollection",
      features: [{ ...f, properties: { ...(f.properties ?? {}), height, value: v } } as any],
    };
  }, [paisGeo, provinciaSel, valoresProv]);

  // ESC para deseleccionar (provincia o depto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (departamentoSel) selectDepartamento(null);
      else if (provinciaSel) selectProvincia(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [provinciaSel, departamentoSel, selectProvincia, selectDepartamento]);

  // Map listeners para mover el HUD junto con la cámara.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const update = () => {
      const tr = map.transform;
      setViewState({
        longitude: tr.center.lng, latitude: tr.center.lat,
        zoom: tr.zoom, pitch: tr.pitch, bearing: tr.bearing,
      });
    };
    map.on("move", update);
    map.on("zoom", update);
    return () => { map.off("move", update); map.off("zoom", update); };
  }, []);

  const delitoNombre = delitoId === "all"
    ? "Todos los delitos (suma SNIC)"
    : (dataset?.delitos.find((d) => d.id === delitoId)?.nombre ?? "");
  const totalAll = useMemo(() => dataset && ai >= 0 ? totalNacional(dataset, -1, ai, "hechos") : 0, [dataset, ai]);
  const totalSel = useMemo(() => dataset && ai >= 0 ? totalNacional(dataset, di, ai, "hechos") : 0, [dataset, di, ai]);

  // Centroide de la provincia seleccionada (para anclar el leader-line del HUD).
  const provCentroid = useMemo<[number, number] | null>(() => {
    if (!paisGeo || !provinciaSel) return null;
    const f = paisGeo.features.find((x) => (x.properties as any).provincia_id === provinciaSel);
    return ((f?.properties as any)?.centroid as [number, number] | undefined) ?? null;
  }, [paisGeo, provinciaSel]);
  const depCentroid = useMemo<[number, number] | null>(() => {
    if (!depsGeo || !departamentoSel) return null;
    const f = depsGeo.features.find((x) => (x.properties as any).departamento_id === departamentoSel);
    return ((f?.properties as any)?.centroid as [number, number] | undefined) ?? null;
  }, [depsGeo, departamentoSel]);

  // Proyecta lonlat → pixels para dibujar el leader-line.
  const projectPx = (c: [number, number] | null) => {
    if (!c) return null;
    const m = mapRef.current?.getMap();
    if (!m) return null;
    const p = m.project(c);
    return { x: p.x, y: p.y };
  };
  void viewState; // dependencia implícita
  const provAnchorPx = provCentroid ? projectPx(provCentroid) : null;
  const depAnchorPx = depCentroid ? projectPx(depCentroid) : null;

  if (!dataset) return null;

  return (
    <div ref={wrapperRef} className="fixed inset-0 overflow-hidden" style={{ background: "#000" }}>
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: -63.5, latitude: -38.5, zoom: 3.7, pitch: 0, bearing: 0 }}
        mapStyle={BASE_STYLE}
        minZoom={3}
        maxZoom={11}
        maxPitch={55}
        dragRotate={false}
        touchPitch={false}
        onMouseMove={(e) => {
          const f = e.features?.[0];
          const props = f?.properties ?? {};
          if (nivel === "pais") {
            setHoverProvId(props.provincia_id ?? null);
            setHoverDepId(null);
          } else {
            setHoverDepId(props.departamento_id ?? null);
          }
        }}
        onMouseLeave={() => { setHoverProvId(null); setHoverDepId(null); }}
        onClick={(e) => {
          const f = e.features?.[0];
          const props = (f?.properties ?? {}) as any;
          if (nivel === "pais") {
            // Click a un depto: identificamos la provincia del depto y la seleccionamos.
            const depId = props.departamento_id as string | undefined;
            if (!depId) return;
            const dep = dataset.departamentos.find((d) => d.id === depId);
            if (dep) selectProvincia(dep.provincia_id);
          } else {
            const depId = props.departamento_id as string | undefined;
            if (!depId) return;
            selectDepartamento(depId === departamentoSel ? null : depId);
          }
        }}
        interactiveLayerIds={["deps-fill"]}
        onLoad={() => {
          const m = mapRef.current?.getMap();
          if (!m || !onMapReady) return;
          const once = () => { m.off("idle", once); onMapReady(); };
          m.on("idle", once);
        }}
        style={{ height: "100%", width: "100%", background: "#000" }}
        cursor={(nivel === "pais" ? hoverProvId : hoverDepId) ? "pointer" : "default"}
      >
        <NavigationControl position="bottom-left" visualizePitch={false} showCompass={false} showZoom />

        {/* === Argentina backdrop: garantiza que cualquier hueco entre deptos quede en cinder[0] === */}
        {paisGeo && (
          <Source id="arg-backdrop" type="geojson" data={paisGeo}>
            <Layer
              id="arg-backdrop-fill"
              type="fill"
              paint={{ "fill-color": CINDER[0], "fill-opacity": 1 }}
            />
          </Source>
        )}

        {/* === Isobands halo (clipped to Argentina) === */}
        {isobandsFC && (
          <Source id="isobands" type="geojson" data={isobandsFC}>
            <Layer
              id="isobands-fill"
              type="fill"
              paint={{
                "fill-color": [
                  "interpolate", ["linear"], ["get", "intensity"],
                  0, CINDER[0], 0.2, CINDER[1], 0.4, CINDER[2],
                  0.6, CINDER[3], 0.8, CINDER[4], 1, CINDER[5],
                ],
                "fill-opacity": 0.32,
                "fill-antialias": true,
              }}
            />
          </Source>
        )}

        {/* === Choropleth de los 555 departamentos === */}
        {depsEnriched && (
          <Source id="deps" type="geojson" data={depsEnriched}>
            <Layer
              id="deps-fill"
              type="fill"
              paint={{
                "fill-color": [
                  "interpolate", ["linear"], ["get", "intensity"],
                  0, CINDER[0], 0.2, CINDER[1], 0.4, CINDER[2],
                  0.6, CINDER[3], 0.8, CINDER[4], 1, CINDER[5],
                ],
                "fill-opacity": [
                  "case",
                  ["==", ["get", "departamento_id"], departamentoSel ?? "__none__"], 1,
                  ["==", ["get", "departamento_id"], hoverDepId ?? "__none__"], 0.95,
                  0.84,
                ],
              }}
            />
            <Layer
              id="deps-border"
              type="line"
              paint={{ "line-color": "#1f2329", "line-width": 0.5, "line-opacity": 0.9 }}
            />
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

        {/* === Province outlines + hover/select highlight === */}
        {paisGeo && (
          <Source id="prov-outline" type="geojson" data={paisGeo}>
            <Layer
              id="prov-line"
              type="line"
              paint={{
                "line-color": [
                  "case",
                  ["==", ["get", "provincia_id"], provinciaSel ?? "__none__"], "#f4c95d",
                  ["==", ["get", "provincia_id"], hoverProvId ?? "__none__"], "#e8743a",
                  "#3a4452",
                ],
                "line-width": [
                  "case",
                  ["==", ["get", "provincia_id"], provinciaSel ?? "__none__"], 2.2,
                  ["==", ["get", "provincia_id"], hoverProvId ?? "__none__"], 1.4,
                  0.8,
                ],
                "line-opacity": [
                  "case",
                  ["==", ["get", "provincia_id"], provinciaSel ?? "__none__"], 1,
                  ["==", ["get", "provincia_id"], hoverProvId ?? "__none__"], 0.9,
                  0.55,
                ],
              }}
            />
          </Source>
        )}

        {/* === Extrusion editorial: SÓLO la provincia seleccionada se eleva === */}
        {provExtrusionFC && (
          <Source id="prov-extrusion" type="geojson" data={provExtrusionFC}>
            <Layer
              id="prov-extrusion-fill"
              type="fill-extrusion"
              paint={{
                "fill-extrusion-color": CINDER[5],
                "fill-extrusion-height": ["get", "height"],
                "fill-extrusion-base": 0,
                "fill-extrusion-opacity": 0.45,
                "fill-extrusion-vertical-gradient": true,
              }}
            />
          </Source>
        )}

        {/* === MASK: tapa todo lo que está fuera de Argentina con negro === */}
        {maskGeo && (
          <Source id="world-mask" type="geojson" data={maskGeo}>
            <Layer
              id="world-mask-fill"
              type="fill"
              paint={{ "fill-color": "#000", "fill-opacity": 0.95, "fill-antialias": false }}
            />
          </Source>
        )}
      </MapGL>

      {/* === Leader lines (SVG sobre el mapa) === */}
      <LeaderLines
        provAnchor={nivel === "provincia" && !departamentoSel ? provAnchorPx : null}
        depAnchor={departamentoSel ? depAnchorPx : null}
      />

      {/* === Header === */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30">
        <div className="pointer-events-auto mx-auto flex max-w-[1480px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/55 px-4 py-1.5 backdrop-blur-md">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inset-0 rounded-full bg-amber-300 halo-expand" />
              <span className="absolute inset-0 rounded-full bg-amber-300" />
            </span>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/85">
              Colossus Lab
            </span>
            <span className="h-3 w-px bg-white/15" />
            <span className="text-[10.5px] uppercase tracking-[0.24em] text-white/55">
              Observatorio · Seguridad
            </span>
          </div>
          <nav className="flex items-center gap-2">
            <a href="https://www.colossuslab.org" target="_blank" rel="noreferrer" className="rounded-full border border-white/10 bg-black/55 px-3.5 py-1.5 text-[10.5px] uppercase tracking-[0.18em] text-white/65 backdrop-blur-md transition hover:text-white">
              colossuslab.org
            </a>
            <a href="https://www.argentina.gob.ar/seguridad/estadisticascriminales" target="_blank" rel="noreferrer" className="rounded-full border border-white/10 bg-black/55 px-3.5 py-1.5 text-[10.5px] uppercase tracking-[0.18em] text-white/65 backdrop-blur-md transition hover:text-white">
              Fuente SNIC ↗
            </a>
          </nav>
        </div>
      </div>

      {/* === Headline editorial (sólo a nivel país) === */}
      {nivel === "pais" && (
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
      )}

      {/* === Breadcrumb (en niveles drill) === */}
      {nivel === "provincia" && (
        <div className="pointer-events-auto absolute left-8 top-[88px] z-20 flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-[12px] backdrop-blur-md anim-fade-up">
          <button onClick={() => reset()} className="text-white/55 transition hover:text-white">
            ← Argentina
          </button>
          <span className="text-white/25">›</span>
          <span className="headline text-white">
            {dataset.provincias.find((p) => p.id === provinciaSel)?.nombre}
          </span>
          {departamentoSel && (
            <>
              <span className="text-white/25">›</span>
              <span className="headline text-white/85">
                {dataset.departamentos.find((d) => d.id === departamentoSel)?.nombre}
              </span>
            </>
          )}
        </div>
      )}

      {/* === Legend (top-right) === */}
      <div className="pointer-events-none absolute right-8 top-[88px] z-20 w-[260px] rounded-xl border border-white/10 bg-black/65 px-4 py-3.5 backdrop-blur-md anim-fade-up">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300/85">
          {delitoNombre}
        </div>
        <div className="mt-1 text-[11px] text-white/55 mono num">
          {anio} · {metric === "tasa" ? "tasa /100k hab." : "hechos absolutos"}
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: `linear-gradient(90deg, ${CINDER.join(", ")})` }} />
        <div className="mt-1.5 flex justify-between text-[9.5px] uppercase tracking-[0.16em] text-white/40 num">
          <span>min</span><span>mediana</span><span>max</span>
        </div>
      </div>

      {/* === HUD provincia con leader line === */}
      {nivel === "provincia" && !departamentoSel && provinciaSel && (
        <ProvinciaHUD
          dataset={dataset}
          provinciaId={provinciaSel}
          delitoId={delitoId}
          anio={anio}
          metric={metric}
          anchorPx={provAnchorPx}
          onClose={() => reset()}
        />
      )}

      {/* === HUD departamento con leader line === */}
      {departamentoSel && (
        <DepartamentoHUD
          dataset={dataset}
          departamentoId={departamentoSel}
          delitoId={delitoId}
          anio={anio}
          metric={metric}
          anchorPx={depAnchorPx}
          onClose={() => selectDepartamento(null)}
        />
      )}

      {/* === Bottom filter panel === */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 pb-6">
        <div className="pointer-events-auto mx-auto max-w-[1080px] px-6">
          <div className="rounded-2xl border border-white/10 bg-black/65 px-5 py-4 backdrop-blur-md anim-fade-up">
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
                    {totalAll.toLocaleString("es-AR")}<span className="text-white/45"> hechos</span>
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-white/45">
                {nivel === "pais" ? "Click una provincia para hacer drill-down" : departamentoSel ? "ESC para volver a la provincia" : "Click un departamento · ESC para volver"}
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
                      className={["press-feedback px-4 py-2 text-[12px] font-medium transition",
                        i === 0 ? "border-r border-white/10" : "",
                        metric === m ? "bg-amber-300 text-black" : "text-white/65 hover:text-white"].join(" ")}
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
                  <div className="slider-tooltip" style={{
                    left: `${((anio - dataset.anios[0]) / (dataset.anios[dataset.anios.length - 1] - dataset.anios[0])) * 100}%`,
                  }}>{anio}</div>
                  <input
                    type="range"
                    min={dataset.anios[0]} max={dataset.anios[dataset.anios.length - 1]} step={1}
                    value={anio} onChange={(e) => setAnio(Number(e.target.value))}
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

/* ============== Leader lines SVG ============== */

function LeaderLines({
  provAnchor, depAnchor,
}: {
  provAnchor: { x: number; y: number } | null;
  depAnchor: { x: number; y: number } | null;
}) {
  if (!provAnchor && !depAnchor) return null;
  const w = typeof window !== "undefined" ? window.innerWidth : 1920;
  const h = typeof window !== "undefined" ? window.innerHeight : 1080;
  // HUD ancla del lado derecho. Cards posicionadas en right:32px top:160px aprox.
  const hudX = w - 380;  // edge izquierdo del HUD (ancho 360)
  const hudY = 230;      // y central del HUD aprox
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10"
      width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      style={{ width: "100%", height: "100%" }}
    >
      <defs>
        <radialGradient id="leader-glow">
          <stop offset="0%" stopColor="#f4c95d" stopOpacity="1" />
          <stop offset="100%" stopColor="#f4c95d" stopOpacity="0" />
        </radialGradient>
      </defs>
      {provAnchor && (
        <g>
          <circle cx={provAnchor.x} cy={provAnchor.y} r={18} fill="url(#leader-glow)" />
          <circle cx={provAnchor.x} cy={provAnchor.y} r={5} fill="#f4c95d" />
          <circle cx={provAnchor.x} cy={provAnchor.y} r={3} fill="#0e1014" />
          <path
            d={`M ${provAnchor.x},${provAnchor.y} L ${(provAnchor.x + hudX) / 2},${provAnchor.y} L ${hudX - 4},${hudY}`}
            stroke="#f4c95d" strokeWidth="1" fill="none" strokeOpacity="0.85"
          />
        </g>
      )}
      {depAnchor && (
        <g>
          <circle cx={depAnchor.x} cy={depAnchor.y} r={14} fill="url(#leader-glow)" />
          <circle cx={depAnchor.x} cy={depAnchor.y} r={4} fill="#fef3c7" />
          <path
            d={`M ${depAnchor.x},${depAnchor.y} L ${(depAnchor.x + hudX) / 2},${depAnchor.y} L ${hudX - 4},${hudY}`}
            stroke="#fef3c7" strokeWidth="1" fill="none" strokeOpacity="0.85"
          />
        </g>
      )}
    </svg>
  );
}

/* ============== HUD provincia ============== */

function ProvinciaHUD({
  dataset, provinciaId, delitoId, anio, metric, anchorPx, onClose,
}: {
  dataset: Dataset; provinciaId: string;
  delitoId: string; anio: number; metric: Metric;
  anchorPx: { x: number; y: number } | null;
  onClose: () => void;
}) {
  void anchorPx;
  const prov = dataset.provincias.find((p) => p.id === provinciaId);
  const provIdx = dataset.provincias.findIndex((p) => p.id === provinciaId);
  const ai = dataset.anios.indexOf(anio);
  if (!prov || provIdx < 0 || ai < 0) return null;

  const top5 = topNDelitosProvincia(dataset, provIdx, ai, 5);
  const isAll = delitoId === "all";
  const di = isAll ? -1 : dataset.delitos.findIndex((d) => d.id === delitoId);

  const tasa = isAll ? 0 : (di >= 0 ? dataset.prov_tasa[provIdx][di][ai] : 0);
  const hechos = isAll
    ? totalProvincia(dataset, provIdx, ai, "hechos")
    : (di >= 0 ? dataset.prov_hechos[provIdx][di][ai] : 0);
  const serie = serieProvincia(dataset, provIdx, isAll ? "all" : delitoId, "hechos");
  const evo = evolucion5Anios(serie, ai);
  const maxTop5 = top5[0]?.hechos ?? 1;

  return (
    <div className="pointer-events-auto absolute right-8 top-[160px] z-20 w-[360px] rounded-2xl border border-amber-300/30 bg-black/75 px-5 py-5 backdrop-blur-md anim-fade-up">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-amber-300/80">Provincia</div>
          <div className="mt-1 headline text-[28px] leading-tight text-white">{prov.nombre}</div>
        </div>
        <button onClick={onClose} className="rounded-md border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/55 transition hover:text-white">
          ✕
        </button>
      </div>

      {/* 3 stats comparativas */}
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
        <Stat label={isAll ? "Tasa avg" : "Tasa /100k"} value={isAll ? "—" : tasa.toLocaleString("es-AR", { maximumFractionDigits: 1 })} unit={isAll ? "" : "/100k"} />
        <Stat label="Hechos" value={hechos.toLocaleString("es-AR")} unit="" />
        <Stat label="Δ 5 años" value={
          evo.deltaPct === null ? "—" : `${evo.deltaPct >= 0 ? "+" : ""}${evo.deltaPct.toFixed(1)}%`
        } unit="" tint={
          evo.deltaPct === null ? "neutral" : evo.deltaPct >= 5 ? "danger" : evo.deltaPct <= -5 ? "good" : "neutral"
        } />
      </div>

      {/* Top 5 delitos */}
      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="text-[9.5px] uppercase tracking-[0.18em] text-amber-300/85">Top 5 categorías · {anio}</div>
        <ul className="mt-3 space-y-2">
          {top5.map((r) => (
            <li key={r.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-white/90">{r.nombre}</div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
                    style={{ width: `${(r.hechos / maxTop5) * 100}%` }}
                  />
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11.5px] font-semibold text-white num">{r.hechos.toLocaleString("es-AR")}</div>
                <div className="text-[9.5px] text-white/45 mono num">{r.pct.toFixed(1)}%</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 border-t border-white/10 pt-3 text-[10px] leading-snug text-white/45">
        Click un departamento para drill-in · ESC para volver al país
      </div>
    </div>
  );
}

/* ============== HUD departamento ============== */

function DepartamentoHUD({
  dataset, departamentoId, delitoId, anio, metric, anchorPx, onClose,
}: {
  dataset: Dataset; departamentoId: string;
  delitoId: string; anio: number; metric: Metric;
  anchorPx: { x: number; y: number } | null;
  onClose: () => void;
}) {
  void anchorPx;
  const dep = dataset.departamentos.find((d) => d.id === departamentoId);
  const depIdx = dataset.departamentos.findIndex((d) => d.id === departamentoId);
  const ai = dataset.anios.indexOf(anio);
  if (!dep || depIdx < 0 || ai < 0) return null;
  const prov = dataset.provincias.find((p) => p.id === dep.provincia_id);

  const top5 = topNDelitosDepartamento(dataset, depIdx, ai, 5);
  const isAll = delitoId === "all";
  const di = isAll ? -1 : dataset.delitos.findIndex((d) => d.id === delitoId);

  const tasa = isAll ? 0 : (di >= 0 ? dataset.dep_tasa[depIdx][di][ai] : 0);
  const hechos = isAll
    ? totalDepartamento(dataset, depIdx, ai, "hechos")
    : (di >= 0 ? dataset.dep_hechos[depIdx][di][ai] : 0);
  const serie = serieDepartamento(dataset, depIdx, isAll ? "all" : delitoId, "hechos");
  const evo = evolucion5Anios(serie, ai);
  const maxTop5 = top5[0]?.hechos ?? 1;
  void metric;

  return (
    <div className="pointer-events-auto absolute right-8 top-[160px] z-20 w-[360px] rounded-2xl border border-amber-200/40 bg-black/75 px-5 py-5 backdrop-blur-md anim-fade-up">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-amber-200/85">Departamento</div>
          <div className="mt-1 headline text-[22px] leading-tight text-white">{dep.nombre}</div>
          <div className="mt-0.5 text-[11.5px] text-white/55">{prov?.nombre}</div>
        </div>
        <button onClick={onClose} className="rounded-md border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/55 transition hover:text-white">
          ✕
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
        <Stat label={isAll ? "Tasa avg" : "Tasa /100k"} value={isAll ? "—" : tasa.toLocaleString("es-AR", { maximumFractionDigits: 1 })} unit={isAll ? "" : "/100k"} />
        <Stat label="Hechos" value={hechos.toLocaleString("es-AR")} unit="" />
        <Stat label="Δ 5 años" value={
          evo.deltaPct === null ? "—" : `${evo.deltaPct >= 0 ? "+" : ""}${evo.deltaPct.toFixed(1)}%`
        } unit="" tint={
          evo.deltaPct === null ? "neutral" : evo.deltaPct >= 5 ? "danger" : evo.deltaPct <= -5 ? "good" : "neutral"
        } />
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="text-[9.5px] uppercase tracking-[0.18em] text-amber-200/85">Top 5 categorías · {anio}</div>
        <ul className="mt-3 space-y-2">
          {top5.map((r) => (
            <li key={r.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-white/90">{r.nombre}</div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/8">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-100"
                    style={{ width: `${(r.hechos / maxTop5) * 100}%` }} />
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11.5px] font-semibold text-white num">{r.hechos.toLocaleString("es-AR")}</div>
                <div className="text-[9.5px] text-white/45 mono num">{r.pct.toFixed(1)}%</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, tint = "neutral" }: { label: string; value: string; unit: string; tint?: "neutral" | "good" | "danger" }) {
  const c = tint === "danger" ? "text-rose-300" : tint === "good" ? "text-emerald-300" : "text-white";
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className={`mt-1 text-[18px] font-semibold leading-none tracking-tight num ${c}`}>
        {value}<span className="text-[9px] font-normal text-white/45">{unit}</span>
      </div>
    </div>
  );
}

function bboxOf(feature: GeoJSON.Feature): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (c: any) => {
    if (typeof c[0] === "number") {
      if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0];
      if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1];
    } else c.forEach(walk);
  };
  walk((feature.geometry as any).coordinates);
  return [minX, minY, maxX, maxY];
}
