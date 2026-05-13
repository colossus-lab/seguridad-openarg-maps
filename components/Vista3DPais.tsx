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
import { loadPaisGeojson, loadDepartamentosAll } from "@/lib/data";
import { computeIsobands } from "@/lib/isobands";
import type { Dataset, Metric } from "@/lib/types";

// Estilo minimal: fondo desk plano, sin tiles externos. Argentina se dibuja
// 100% desde nuestras geometrías → ningún artefacto de tessellation por mask
// y rendimiento óptimo (no descarga ningún tile).
const BASE_STYLE: any = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {},
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#1a1208" } },
  ],
};

// Paleta ink-on-paper: del color natural del papel (cream) hasta tinta profunda.
// Pensada para verse como una ilustración a tinta sobre papel sepia.
const CINDER = ["#ebe0c4", "#d4b88a", "#b08458", "#984a3a", "#6e2a1a", "#2a1410"];
const PAPER = "#f0e3c8";   // cream del papel (Argentina shape)
const DESK = "#1a1208";    // dark desk (alrededor del papel)
const INK = "#3a2418";     // ink color para borders
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
  const [hoverProvId, setHoverProvId] = useState<string | null>(null);
  const [hoverDepId, setHoverDepId] = useState<string | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const [viewState, setViewState] = useState({
    longitude: -63.5, latitude: -38.5, zoom: 3.7, pitch: 0, bearing: 0,
  });
  const mapRef = useRef<MapRef | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const orbitRafRef = useRef<number | null>(null);
  const nivel: "pais" | "provincia" = provinciaSel ? "provincia" : "pais";

  // Mobile detection via media query — controla layout y padding del mapa
  const [isMobile, setIsMobile] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    loadPaisGeojson().then(setPaisGeo).catch(console.error);
    loadDepartamentosAll().then(setDepsGeo).catch(console.error);
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

  // Camera transitions:
  //   depto:     easeTo centroide + pitch 42°
  //   provincia: fitBounds + orbit 360° cinematográfico
  //   reset:     vuelta a Argentina plana
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !paisGeo || !depsGeo) return;

    // Cancelar cualquier orbit en curso si cambia la selección
    if (orbitRafRef.current !== null) {
      cancelAnimationFrame(orbitRafRef.current);
      orbitRafRef.current = null;
    }

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const easeInOut = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    if (departamentoSel) {
      const f = depsGeo.features.find((x) => (x.properties as any).departamento_id === departamentoSel);
      const c = (f?.properties as any)?.centroid as [number, number] | undefined;
      if (c) {
        const pad = isMobile
          ? { top: 64, right: 24, bottom: 240, left: 24 }
          : { top: 0, right: 380, bottom: 0, left: 340 };
        map.easeTo({
          center: c, zoom: 7.2, pitch: 42, bearing: 0,
          padding: pad as any,
          duration: 1200, easing: easeOut,
        });
      }
    } else if (provinciaSel) {
      const prov = paisGeo.features.find((x) => (x.properties as any).provincia_id === provinciaSel);
      if (!prov) return;
      const bb = bboxOf(prov);
      const pad = isMobile
        ? { top: 100, right: 24, bottom: 240, left: 24 }   // bottom-sheet HUD ~32vh
        : { top: 100, right: 380, bottom: 100, left: 340 };
      map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], {
        padding: pad,
        pitch: 50, bearing: -6, duration: 1100, easing: easeOut, maxZoom: 7.5,
      });
      void easeInOut;
    } else {
      const pad = isMobile
        ? { top: 64, right: 0, bottom: 0, left: 0 }
        : { top: 0, right: 0, bottom: 0, left: 340 };
      map.easeTo({
        center: [-63.5, -38.5], zoom: isMobile ? 3.3 : 3.7, pitch: 0, bearing: 0,
        padding: pad as any,
        duration: 1200, easing: easeOut,
      });
    }
  }, [provinciaSel, departamentoSel, paisGeo, depsGeo]);

  // Cleanup al desmontar
  useEffect(() => () => {
    if (orbitRafRef.current !== null) cancelAnimationFrame(orbitRafRef.current);
  }, []);

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

  // (Extrusion 3D removida — modo paper/ink no usa extrusion editorial)
  void valoresProv;

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
    <div ref={wrapperRef} className="fixed inset-0 overflow-hidden paper-texture" style={{ background: DESK }}>
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
          const depId = (props.departamento_id as string | undefined) ?? null;
          setHoverDepId(depId);
          if (nivel === "pais") {
            setHoverProvId((props.provincia_id as string | undefined) ?? null);
          }
          if (depId && e.point) {
            setHoverPoint({ x: e.point.x, y: e.point.y });
          } else {
            setHoverPoint(null);
          }
        }}
        onMouseLeave={() => { setHoverProvId(null); setHoverDepId(null); setHoverPoint(null); }}
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
          if (!m) return;
          // Padding responsive: sidebar 340 en desktop, top compact bar 64 en mobile
          const pad = isMobile
            ? { top: 64, right: 0, bottom: 0, left: 0 }
            : { top: 0, right: 0, bottom: 0, left: 340 };
          m.easeTo({
            center: [-63.5, -38.5], zoom: isMobile ? 3.3 : 3.7, pitch: 0, bearing: 0,
            padding: pad as any,
            duration: 0,
          });
          if (!onMapReady) return;
          const once = () => { m.off("idle", once); onMapReady(); };
          m.on("idle", once);
        }}
        style={{ height: "100%", width: "100%", background: DESK }}
        cursor={(nivel === "pais" ? hoverProvId : hoverDepId) ? "pointer" : "default"}
      >
        <NavigationControl position="bottom-left" visualizePitch={false} showCompass={false} showZoom />

        {/* === Argentina backdrop: el "papel" — cream uniforme. Garantiza no-gaps === */}
        {paisGeo && (
          <Source id="arg-backdrop" type="geojson" data={paisGeo}>
            <Layer
              id="arg-backdrop-fill"
              type="fill"
              paint={{ "fill-color": PAPER, "fill-opacity": 1 }}
            />
          </Source>
        )}

        {/* === Isobands halo (clipped to Argentina) — wash de tinta aguada === */}
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
                "fill-opacity": 0.22,
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
                  ["==", ["get", "departamento_id"], departamentoSel ?? "__none__"], 0.95,
                  ["==", ["get", "departamento_id"], hoverDepId ?? "__none__"], 0.88,
                  0.76,
                ],
              }}
            />
            <Layer
              id="deps-border"
              type="line"
              paint={{
                "line-color": INK,
                "line-width": 0.6,
                "line-opacity": 0.55,
                "line-blur": 0.3,
              }}
            />
            <Layer
              id="deps-stroke-active"
              type="line"
              paint={{
                "line-color": [
                  "case",
                  ["==", ["get", "departamento_id"], departamentoSel ?? "__none__"], "#1a0c08",
                  ["==", ["get", "departamento_id"], hoverDepId ?? "__none__"], "#3a2418",
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

        {/* === Province outlines tipo trazo a tinta gruesa === */}
        {paisGeo && (
          <Source id="prov-outline" type="geojson" data={paisGeo}>
            {/* Sombra inferior simulando el grosor irregular de la tinta */}
            <Layer
              id="prov-line-ink-shadow"
              type="line"
              paint={{
                "line-color": INK,
                "line-width": 2.4,
                "line-opacity": 0.25,
                "line-blur": 1.6,
              }}
            />
            <Layer
              id="prov-line"
              type="line"
              paint={{
                "line-color": [
                  "case",
                  ["==", ["get", "provincia_id"], provinciaSel ?? "__none__"], "#1a0c08",
                  ["==", ["get", "provincia_id"], hoverProvId ?? "__none__"], "#5a3a26",
                  INK,
                ],
                "line-width": [
                  "case",
                  ["==", ["get", "provincia_id"], provinciaSel ?? "__none__"], 1.8,
                  ["==", ["get", "provincia_id"], hoverProvId ?? "__none__"], 1.3,
                  1.05,
                ],
                "line-opacity": [
                  "case",
                  ["==", ["get", "provincia_id"], provinciaSel ?? "__none__"], 1,
                  ["==", ["get", "provincia_id"], hoverProvId ?? "__none__"], 0.92,
                  0.85,
                ],
                "line-blur": 0.35,
              }}
            />
          </Source>
        )}

        {/* Mask removida: el basemap minimal con background color "#1a1208" ya cubre
            todo lo no-Argentina. Sin mask geojson → sin tessellation artifacts. */}

        {/* === Hover extrusion: el depto bajo el mouse se eleva ligeramente === */}
        {!isMobile && hoverDepId && depsGeo && (
          <Source
            id="dep-hover-extrusion"
            type="geojson"
            data={{
              type: "FeatureCollection",
              features: depsGeo.features.filter(
                (f) => (f.properties as any).departamento_id === hoverDepId,
              ),
            }}
          >
            <Layer
              id="dep-hover-extrusion-fill"
              type="fill-extrusion"
              paint={{
                "fill-extrusion-color": "#f4c95d",
                // Altura modesta — sólo para marcar diferencia. Más alto en provincia (pitch 50)
                // donde la perspectiva ya está activa; subtle en país (pitch 0).
                "fill-extrusion-height": nivel === "provincia" ? 18000 : 8000,
                "fill-extrusion-base": 0,
                "fill-extrusion-opacity": 0.72,
                "fill-extrusion-vertical-gradient": true,
              }}
            />
          </Source>
        )}
      </MapGL>

      {/* === Leader lines (SVG sobre el mapa) — desktop only === */}
      <div className="hidden md:block">
        <LeaderLines
          provAnchor={nivel === "provincia" && !departamentoSel ? provAnchorPx : null}
          depAnchor={departamentoSel ? depAnchorPx : null}
        />
      </div>

      {/* === Hover tooltip near cursor (desktop only) === */}
      {!isMobile && hoverDepId && hoverPoint && (
        <HoverTooltip
          dataset={dataset}
          depId={hoverDepId}
          point={hoverPoint}
          delitoId={delitoId}
          anio={anio}
          metric={metric}
        />
      )}

      {/* === Header nav: desktop muestra los dos chips, mobile sólo Fuente SNIC === */}
      <div className="pointer-events-none absolute right-0 top-0 z-40">
        <nav className="pointer-events-auto flex items-center gap-2 px-4 py-3 md:px-6 md:py-4">
          <a href="https://www.colossuslab.org" target="_blank" rel="noreferrer" className="hidden rounded-full border border-white/10 bg-black/55 px-3.5 py-1.5 text-[10.5px] uppercase tracking-[0.18em] text-white/65 backdrop-blur-md transition hover:text-white md:inline-block">
            colossuslab.org
          </a>
          <a href="https://www.argentina.gob.ar/seguridad/estadisticascriminales" target="_blank" rel="noreferrer" className="rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-white/65 backdrop-blur-md transition hover:text-white md:px-3.5 md:text-[10.5px] md:tracking-[0.18em]">
            SNIC ↗
          </a>
        </nav>
      </div>

      {/* === Sidebar izquierda anclada (DESKTOP only) === */}
      <aside className="pointer-events-auto absolute left-0 top-0 z-30 hidden h-full w-[320px] flex-col gap-5 border-r border-white/8 bg-black/65 px-5 pb-6 pt-5 backdrop-blur-md anim-fade-up md:flex">
        {/* Chip Colossus institucional */}
        <div className="inline-flex items-center gap-2.5 self-start rounded-full border border-white/10 bg-black/50 px-3 py-1.5">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-amber-300 halo-expand" />
            <span className="absolute inset-0 rounded-full bg-amber-300" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/85">
            Colossus Lab
          </span>
          <span className="h-3 w-px bg-white/15" />
          <span className="text-[10px] uppercase tracking-[0.22em] text-white/55">
            Observatorio
          </span>
        </div>

        {/* Eyebrow */}
        <div className="text-[10px] uppercase tracking-[0.22em] text-amber-300/85">
          Open Arg · SNIC · {dataset.anios[0]}–{dataset.anios[dataset.anios.length - 1]}
        </div>

        {/* Headline o breadcrumb */}
        {nivel === "pais" ? (
          <div>
            <h1 className="headline text-[30px] leading-[1.05] tracking-[-0.012em] text-white">
              Mapa de inseguridad
              <span className="block text-white/55">República Argentina</span>
            </h1>
            <p className="mt-3 text-[11.5px] leading-snug text-white/55">
              {dataset.provincias.length} provincias · {dataset.departamentos.length} departamentos · {dataset.delitos.length} categorías SNIC.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-baseline gap-1.5 text-[12px]">
            <button onClick={() => reset()} className="text-white/55 transition hover:text-white">
              ← Argentina
            </button>
            <span className="text-white/25">›</span>
            <span className="headline text-[15px] text-white">
              {dataset.provincias.find((p) => p.id === provinciaSel)?.nombre}
            </span>
            {departamentoSel && (
              <>
                <span className="text-white/25">›</span>
                <span className="headline text-[13px] text-white/85">
                  {dataset.departamentos.find((d) => d.id === departamentoSel)?.nombre}
                </span>
              </>
            )}
          </div>
        )}

        <div className="h-px bg-white/8" />

        {/* Filtros */}
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-white/55">Tipo de delito</span>
            <select
              value={delitoId}
              onChange={(e) => setDelito(e.target.value)}
              className="rounded-md border border-white/10 bg-black/40 px-2.5 py-2 text-[12.5px] text-white outline-none focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/20"
            >
              <option value="all">— Todos los delitos (suma SNIC) —</option>
              {dataset.delitos.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-white/55">Métrica</span>
            <div className="inline-flex overflow-hidden rounded-md border border-white/10 bg-black/40">
              {(["tasa", "hechos"] as const).map((m, i) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={["press-feedback flex-1 px-2 py-2 text-[11.5px] font-medium transition",
                    i === 0 ? "border-r border-white/10" : "",
                    metric === m ? "bg-amber-300 text-black" : "text-white/65 hover:text-white"].join(" ")}
                >
                  {m === "tasa" ? "Tasa /100k" : "Hechos"}
                </button>
              ))}
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-white/55">Año</span>
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

        <div className="h-px bg-white/8" />

        {/* Stats compactos */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-300/85">Categoría · {anio}</div>
            <div className="mt-0.5 text-[18px] font-semibold leading-none tracking-tight text-white num">
              {totalSel.toLocaleString("es-AR")}
            </div>
            <div className="mt-0.5 text-[9.5px] text-white/45">hechos</div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/45">Total agregado</div>
            <div className="mt-0.5 text-[18px] font-semibold leading-none tracking-tight text-white/75 num">
              {totalAll.toLocaleString("es-AR")}
            </div>
            <div className="mt-0.5 text-[9.5px] text-white/45">SNIC total</div>
          </div>
        </div>

        <div className="h-px bg-white/8" />

        {/* Legend */}
        <div>
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-amber-300/85">
            {delitoNombre}
          </div>
          <div className="mt-1 text-[10.5px] text-white/55 mono num">
            {anio} · {metric === "tasa" ? "tasa /100k hab." : "hechos absolutos"}
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: `linear-gradient(90deg, ${CINDER.join(", ")})` }} />
          <div className="mt-1.5 flex justify-between text-[9px] uppercase tracking-[0.16em] text-white/40 num">
            <span>min</span><span>mediana</span><span>max</span>
          </div>
          <div className="mt-2 text-[10px] leading-snug text-white/45">
            Color por percentil · escala perceptual robusta a outliers.
          </div>
        </div>

        <div className="flex-1" />

        {/* Footer instructivo */}
        <div className="text-[10px] leading-snug text-white/40">
          {nivel === "pais"
            ? "Click una provincia para drill-down."
            : departamentoSel
              ? "ESC vuelve a la provincia. ✕ cierra detalle."
              : "Click un departamento · ESC para volver."}
        </div>
      </aside>

      {/* === MOBILE: top compact bar (chip Colossus + categoría + año, tap → bottom sheet) === */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-3 pt-3 md:hidden">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/65 px-3 py-1.5 backdrop-blur-md">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 rounded-full bg-amber-300 halo-expand" />
            <span className="absolute inset-0 rounded-full bg-amber-300" />
          </span>
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-white/85">Colossus</span>
        </div>
        <button
          onClick={() => setFiltersOpen(true)}
          className="pointer-events-auto flex min-w-0 flex-1 items-center justify-between gap-2 rounded-full border border-white/10 bg-black/65 px-3.5 py-1.5 text-left backdrop-blur-md transition active:scale-[0.98]"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold text-white">{delitoNombre}</div>
            <div className="text-[9.5px] text-white/55 mono num">{anio} · {metric === "tasa" ? "tasa /100k" : "hechos"}</div>
          </div>
          <svg className="h-3.5 w-3.5 text-white/55" viewBox="0 0 12 12" fill="none">
            <path d="M3 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* === MOBILE: bottom sheet drawer con filtros completos === */}
      {filtersOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setFiltersOpen(false)}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm anim-fade-up" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#0a0808] px-5 pb-8 pt-5 anim-fade-up"
          >
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-white/15" />
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.22em] text-amber-300/85">
                Filtros · SNIC {dataset.anios[0]}–{dataset.anios[dataset.anios.length - 1]}
              </div>
              <button onClick={() => setFiltersOpen(false)} className="rounded-md border border-white/15 px-2 py-0.5 text-[10px] text-white/55">
                ✕
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-white/55">Tipo de delito</span>
                <select
                  value={delitoId}
                  onChange={(e) => setDelito(e.target.value)}
                  className="rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-[13px] text-white outline-none focus:border-amber-300/60"
                >
                  <option value="all">— Todos los delitos (suma SNIC) —</option>
                  {dataset.delitos.map((d) => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-white/55">Métrica</span>
                <div className="inline-flex overflow-hidden rounded-md border border-white/10 bg-black/40">
                  {(["tasa", "hechos"] as const).map((m, i) => (
                    <button
                      key={m}
                      onClick={() => setMetric(m)}
                      className={["press-feedback flex-1 px-3 py-3 text-[12px] font-medium transition",
                        i === 0 ? "border-r border-white/10" : "",
                        metric === m ? "bg-amber-300 text-black" : "text-white/65"].join(" ")}
                    >
                      {m === "tasa" ? "Tasa /100k" : "Hechos"}
                    </button>
                  ))}
                </div>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="flex items-baseline justify-between">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-white/55">Año</span>
                  <span className="mono num text-[13px] font-semibold text-white">{anio}</span>
                </span>
                <div className="relative pt-7">
                  <div className="slider-tooltip" style={{
                    left: `${((anio - dataset.anios[0]) / (dataset.anios[dataset.anios.length - 1] - dataset.anios[0])) * 100}%`,
                  }}>{anio}</div>
                  <input
                    type="range"
                    min={dataset.anios[0]} max={dataset.anios[dataset.anios.length - 1]} step={1}
                    value={anio} onChange={(e) => setAnio(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-white/35 mono num">
                    <span>{dataset.anios[0]}</span>
                    <span>{dataset.anios[dataset.anios.length - 1]}</span>
                  </div>
                </div>
              </label>

              <div className="mt-2 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-300/85">Categoría · {anio}</div>
                  <div className="mt-0.5 text-[18px] font-semibold leading-none text-white num">{totalSel.toLocaleString("es-AR")}</div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/45">Total SNIC</div>
                  <div className="mt-0.5 text-[18px] font-semibold leading-none text-white/75 num">{totalAll.toLocaleString("es-AR")}</div>
                </div>
              </div>

              <div className="mt-2 border-t border-white/10 pt-4">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-amber-300/85">Escala de color</div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: `linear-gradient(90deg, ${CINDER.join(", ")})` }} />
                <div className="mt-1.5 flex justify-between text-[9px] uppercase tracking-[0.16em] text-white/40 num">
                  <span>min</span><span>mediana</span><span>max</span>
                </div>
                <div className="mt-2 text-[10px] leading-snug text-white/45">
                  Color por percentil · escala perceptual robusta a outliers.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === HUD provincia (right desktop / bottom-sheet mobile) === */}
      {nivel === "provincia" && !departamentoSel && provinciaSel && (
        <ProvinciaHUD
          dataset={dataset}
          provinciaId={provinciaSel}
          delitoId={delitoId}
          anio={anio}
          metric={metric}
          anchorPx={provAnchorPx}
          isMobile={isMobile}
          onClose={() => reset()}
        />
      )}

      {/* === HUD departamento === */}
      {departamentoSel && (
        <DepartamentoHUD
          isMobile={isMobile}
          dataset={dataset}
          departamentoId={departamentoSel}
          delitoId={delitoId}
          anio={anio}
          metric={metric}
          anchorPx={depAnchorPx}
          onClose={() => selectDepartamento(null)}
        />
      )}
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
  // HUD anclado a la derecha: right:32px width:360px → edge izquierdo en w - 392
  const hudX = w - 392;
  const hudY = 220; // y central del HUD aprox (top-[160px] + ~60px)
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
  dataset, provinciaId, delitoId, anio, metric, anchorPx, onClose, isMobile,
}: {
  dataset: Dataset; provinciaId: string;
  delitoId: string; anio: number; metric: Metric;
  anchorPx: { x: number; y: number } | null;
  isMobile?: boolean;
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

  // Serie de 5 años por categoría para sparkline
  const from = Math.max(0, ai - 4);
  const top5Series = top5.map((r) => {
    const s = serieProvincia(dataset, provIdx, r.id, "hechos");
    return s.slice(from, ai + 1);
  });

  const [expanded, setExpanded] = useState(false);
  const containerCls = isMobile
    ? `pointer-events-auto fixed inset-x-0 bottom-0 z-20 overflow-y-auto rounded-t-2xl border-t border-amber-300/30 bg-black/90 px-5 pb-6 pt-3 backdrop-blur-md anim-fade-up transition-[max-height] duration-300 ${expanded ? "max-h-[78vh]" : "max-h-[32vh]"}`
    : "pointer-events-auto absolute right-8 top-[160px] z-20 w-[360px] rounded-2xl border border-amber-300/30 bg-black/75 px-5 py-5 backdrop-blur-md anim-fade-up";

  return (
    <div className={containerCls}>
      {isMobile && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="-mx-5 -mt-3 mb-2 flex w-[calc(100%+2.5rem)] flex-col items-center gap-1 px-5 py-2"
          aria-label={expanded ? "Contraer panel" : "Expandir panel"}
        >
          <div className="h-1 w-12 rounded-full bg-white/20" />
          <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
            {expanded ? "Tap para contraer" : "Tap para ver top 5 ↑"}
          </span>
        </button>
      )}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-amber-300/80">Provincia</div>
          <div className={`mt-1 headline leading-tight text-white ${isMobile ? "text-[22px]" : "text-[28px]"}`}>{prov.nombre}</div>
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
      {(!isMobile || expanded) && (
        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="flex items-baseline justify-between">
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-amber-300/85">Top 5 categorías · {anio}</div>
            <div className="text-[8.5px] uppercase tracking-[0.16em] text-white/35 mono">
              evolución {anio - 4}–{anio}
            </div>
          </div>
          <ul className="mt-3 space-y-3">
            {top5.map((r, i) => (
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
                <Sparkline values={top5Series[i]} color="#fbbf24" width={64} height={20} />
                <div className="w-[60px] text-right">
                  <div className="text-[11.5px] font-semibold text-white num">{r.hechos.toLocaleString("es-AR")}</div>
                  <div className="text-[9.5px] text-white/45 mono num">{r.pct.toFixed(1)}%</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 border-t border-white/10 pt-3 text-[10px] leading-snug text-white/45">
        {isMobile ? "Tap un departamento para drill-in · ✕ vuelve al país" : "Click un departamento para drill-in · ESC para volver al país"}
      </div>
    </div>
  );
}

/* ============== HUD departamento ============== */

function DepartamentoHUD({
  dataset, departamentoId, delitoId, anio, metric, anchorPx, onClose, isMobile,
}: {
  dataset: Dataset; departamentoId: string;
  delitoId: string; anio: number; metric: Metric;
  anchorPx: { x: number; y: number } | null;
  isMobile?: boolean;
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

  // Serie de 5 años por categoría para sparkline
  const from = Math.max(0, ai - 4);
  const top5Series = top5.map((r) => {
    const s = serieDepartamento(dataset, depIdx, r.id, "hechos");
    return s.slice(from, ai + 1);
  });

  const [expanded, setExpanded] = useState(false);
  const containerCls = isMobile
    ? `pointer-events-auto fixed inset-x-0 bottom-0 z-20 overflow-y-auto rounded-t-2xl border-t border-amber-200/40 bg-black/90 px-5 pb-6 pt-3 backdrop-blur-md anim-fade-up transition-[max-height] duration-300 ${expanded ? "max-h-[78vh]" : "max-h-[34vh]"}`
    : "pointer-events-auto absolute right-8 top-[160px] z-20 w-[360px] rounded-2xl border border-amber-200/40 bg-black/75 px-5 py-5 backdrop-blur-md anim-fade-up";

  return (
    <div className={containerCls}>
      {isMobile && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="-mx-5 -mt-3 mb-2 flex w-[calc(100%+2.5rem)] flex-col items-center gap-1 px-5 py-2"
          aria-label={expanded ? "Contraer panel" : "Expandir panel"}
        >
          <div className="h-1 w-12 rounded-full bg-white/20" />
          <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">
            {expanded ? "Tap para contraer" : "Tap para ver top 5 ↑"}
          </span>
        </button>
      )}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-amber-200/85">Departamento</div>
          <div className={`mt-1 headline leading-tight text-white ${isMobile ? "text-[18px]" : "text-[22px]"}`}>{dep.nombre}</div>
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

      {(!isMobile || expanded) && (
        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="flex items-baseline justify-between">
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-amber-200/85">Top 5 categorías · {anio}</div>
            <div className="text-[8.5px] uppercase tracking-[0.16em] text-white/35 mono">
              evolución {anio - 4}–{anio}
            </div>
          </div>
          <ul className="mt-3 space-y-3">
            {top5.map((r, i) => (
              <li key={r.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-white/90">{r.nombre}</div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/8">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-100"
                      style={{ width: `${(r.hechos / maxTop5) * 100}%` }} />
                  </div>
                </div>
                <Sparkline values={top5Series[i]} color="#fde68a" width={64} height={20} />
                <div className="w-[60px] text-right">
                  <div className="text-[11.5px] font-semibold text-white num">{r.hechos.toLocaleString("es-AR")}</div>
                  <div className="text-[9.5px] text-white/45 mono num">{r.pct.toFixed(1)}%</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Tooltip flotante que sigue el cursor cuando el mouse hovea un departamento.
   Muestra nombre del depto + provincia + valor de la métrica actual. */
function HoverTooltip({
  dataset, depId, point, delitoId, anio, metric,
}: {
  dataset: Dataset; depId: string;
  point: { x: number; y: number };
  delitoId: string; anio: number; metric: Metric;
}) {
  const depIdx = dataset.departamentos.findIndex((d) => d.id === depId);
  const dep = depIdx >= 0 ? dataset.departamentos[depIdx] : null;
  if (!dep) return null;
  const prov = dataset.provincias.find((p) => p.id === dep.provincia_id);
  const ai = dataset.anios.indexOf(anio);
  const isAll = delitoId === "all";
  const di = isAll ? -1 : dataset.delitos.findIndex((d) => d.id === delitoId);
  const val = isAll
    ? totalDepartamento(dataset, depIdx, ai, metric)
    : valorDepartamento(dataset, depIdx, di, ai, metric);
  const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: metric === "tasa" ? 1 : 0 });
  const unidad = metric === "tasa" ? "/100k" : "hechos";

  // Anti-clipping: si está cerca del borde derecho/inferior, flippeo el offset
  const w = typeof window !== "undefined" ? window.innerWidth : 1920;
  const h = typeof window !== "undefined" ? window.innerHeight : 1080;
  const flipX = point.x + 240 > w;
  const flipY = point.y + 110 > h;
  const left = flipX ? point.x - 16 : point.x + 16;
  const top = flipY ? point.y - 16 : point.y + 16;
  const transform = `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`;

  return (
    <div
      className="pointer-events-none absolute z-30 rounded-lg border border-amber-300/30 bg-black/85 px-3 py-2 backdrop-blur-md"
      style={{ left, top, transform }}
    >
      <div className="text-[9.5px] uppercase tracking-[0.2em] text-amber-300/85">Departamento</div>
      <div className="mt-0.5 headline text-[14px] leading-tight text-white">{dep.nombre}</div>
      <div className="mt-0.5 text-[10.5px] text-white/55">{prov?.nombre}</div>
      <div className="mt-1.5 flex items-baseline gap-1 num">
        <span className="text-[14px] font-semibold text-white">{fmt(val)}</span>
        <span className="text-[9.5px] text-white/55 mono">{unidad}</span>
      </div>
    </div>
  );
}

/** Mini sparkline SVG (line + área tenue) para la evolución de una categoría. */
function Sparkline({ values, color = "#fbbf24", width = 64, height = 18 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const px = (i: number) => (i / (values.length - 1)) * (width - 2) + 1;
  const py = (v: number) => height - 2 - ((v - min) / range) * (height - 4);
  const pts = values.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`);
  const linePath = `M ${pts.join(" L ")}`;
  const areaPath = `M ${px(0).toFixed(1)},${height - 1} L ${pts.join(" L ")} L ${px(values.length - 1).toFixed(1)},${height - 1} Z`;
  // último punto destacado
  const lastX = px(values.length - 1);
  const lastY = py(values[values.length - 1]);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={areaPath} fill={color} fillOpacity="0.16" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="1.8" fill={color} />
    </svg>
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
