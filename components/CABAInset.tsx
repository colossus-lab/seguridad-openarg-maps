"use client";

import { useMemo, useState } from "react";
import type { Dataset, Metric } from "@/lib/types";
import { totalProvincia, valorProvincia } from "@/lib/analytics";

// Choropleth CINDER editorial — same as Vista3DPais.
const CINDER = ["#3D4A66", "#5C7FB0", "#74ACDF", "#FFD04A", "#F6B40E", "#C03A18"];

// CABA bbox (lat/lon) — fixed, calibrated against pais.geojson "Ciudad
// Autónoma" feature. Used to project the 15 comunas to a local SVG viewport.
const CABA_BBOX = { minLon: -58.531, maxLon: -58.337, minLat: -34.701, maxLat: -34.528 };

// SVG viewport (square; aspect mostly preserved since CABA is roughly square).
const SVG_W = 320;
const SVG_H = 320;

type Props = {
  dataset: Dataset;
  depsGeo: GeoJSON.FeatureCollection | null;
  valoresDep: Map<string, number>;
  delitoId: string;
  anio: number;
  metric: Metric;
  isMobile: boolean;
  collapsed: boolean;             // true cuando hay departamentoSel CABA → solo header
  onClose: () => void;
  onSelectComuna: (id: string) => void;
  selectedDepId: string | null;   // departamento seleccionado actual (para highlight)
};

function projectLonLat(lon: number, lat: number): [number, number] {
  const dLon = CABA_BBOX.maxLon - CABA_BBOX.minLon;
  const dLat = CABA_BBOX.maxLat - CABA_BBOX.minLat;
  const x = ((lon - CABA_BBOX.minLon) / dLon) * SVG_W;
  const y = SVG_H - ((lat - CABA_BBOX.minLat) / dLat) * SVG_H;
  return [x, y];
}

function ringToPath(ring: number[][]): string {
  if (ring.length < 3) return "";
  const parts: string[] = [];
  let first = true;
  for (const [lon, lat] of ring) {
    const [x, y] = projectLonLat(lon, lat);
    parts.push((first ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1));
    first = false;
  }
  parts.push("Z");
  return parts.join("");
}

function geomToPath(geom: GeoJSON.Geometry): string {
  if (geom.type === "Polygon") {
    return geom.coordinates.map(ringToPath).join("");
  }
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.flatMap((poly) => poly.map(ringToPath)).join("");
  }
  return "";
}

export default function CABAInset({
  dataset, depsGeo, valoresDep, delitoId, anio, metric,
  isMobile, collapsed, onClose, onSelectComuna, selectedDepId,
}: Props) {
  const [hoverComunaId, setHoverComunaId] = useState<string | null>(null);

  // 15 comunas: features de CABA + paths proyectados + valores.
  const comunas = useMemo(() => {
    if (!depsGeo) return [];
    const provIdx = dataset.provincias.findIndex((p) => p.id === "02");
    void provIdx;
    return depsGeo.features
      .filter((f) => (f.properties as any)?.provincia_id === "02")
      .map((f) => {
        const props = f.properties as any;
        const id = props.departamento_id as string;
        const nombre = (props.nombre as string) ?? id;
        const value = valoresDep.get(id) ?? 0;
        const path = geomToPath(f.geometry);
        return { id, nombre, value, path };
      });
  }, [depsGeo, dataset, valoresDep]);

  // Percentile rank LOCAL a CABA (no global) → mejor distinción visual entre las 15.
  const intensities = useMemo(() => {
    const positives = comunas.map((c) => c.value).filter((v) => v > 0).sort((a, b) => a - b);
    const N = positives.length;
    const pct = (v: number) => {
      if (v <= 0 || N === 0) return 0;
      let lo = 0, hi = N;
      while (lo < hi) {
        const m = (lo + hi) >>> 1;
        if (positives[m] < v) lo = m + 1; else hi = m;
      }
      return 0.08 + ((lo + 1) / N) * 0.92;
    };
    return new Map(comunas.map((c) => [c.id, pct(c.value)]));
  }, [comunas]);

  // Color por comuna via interpolación CINDER.
  const colorFor = (intensity: number): string => {
    if (intensity <= 0) return CINDER[0];
    const i = Math.min(intensity, 1) * 5;
    const lo = Math.floor(i);
    const hi = Math.min(lo + 1, 5);
    const t = i - lo;
    // simple linear interp en RGB
    const a = CINDER[lo], b = CINDER[hi];
    const ra = parseInt(a.slice(1, 3), 16), ga = parseInt(a.slice(3, 5), 16), ba = parseInt(a.slice(5, 7), 16);
    const rb = parseInt(b.slice(1, 3), 16), gb = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
    const r = Math.round(ra + (rb - ra) * t).toString(16).padStart(2, "0");
    const g = Math.round(ga + (gb - ga) * t).toString(16).padStart(2, "0");
    const bch = Math.round(ba + (bb - ba) * t).toString(16).padStart(2, "0");
    return `#${r}${g}${bch}`;
  };

  // Stats agregados de CABA (provincia "02").
  const provIdx = useMemo(() => dataset.provincias.findIndex((p) => p.id === "02"), [dataset]);
  const ai = useMemo(() => dataset.anios.indexOf(anio), [dataset, anio]);
  const isAll = delitoId === "all";
  const di = isAll ? -1 : dataset.delitos.findIndex((d) => d.id === delitoId);
  const tasaCaba = isAll ? 0 : (di >= 0 ? dataset.prov_tasa[provIdx]?.[di]?.[ai] ?? 0 : 0);
  const hechosCaba = isAll
    ? totalProvincia(dataset, provIdx, ai, "hechos")
    : (di >= 0 ? dataset.prov_hechos[provIdx]?.[di]?.[ai] ?? 0 : 0);
  void valorProvincia;

  // Lista ordenada desc.
  const sortedList = useMemo(
    () => [...comunas].sort((a, b) => b.value - a.value),
    [comunas]
  );
  const maxValue = sortedList[0]?.value ?? 1;

  const containerCls = isMobile
    ? "pointer-events-auto fixed inset-x-0 bottom-0 z-30 max-h-[88vh] overflow-y-auto rounded-t-2xl border-t border-amber-300/30 bg-black/92 px-5 pb-6 pt-3 backdrop-blur-md anim-fade-up"
    : `pointer-events-auto absolute right-6 top-[100px] z-30 w-[380px] rounded-2xl border border-amber-300/30 bg-black/80 backdrop-blur-md anim-fade-up transition-all duration-300 ${collapsed ? "max-h-[64px] overflow-hidden" : "max-h-[calc(100vh-160px)]"}`;

  return (
    <div className={containerCls}>
      {/* === Header === */}
      <div className="flex items-start justify-between gap-2 px-5 pb-3 pt-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-amber-300/85">Inset · Ciudad Autónoma</div>
          <div className="mt-0.5 headline text-[18px] leading-tight text-white">CABA</div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/55 transition hover:text-white"
          aria-label="Cerrar inset CABA"
        >
          ✕
        </button>
      </div>

      {!collapsed && (
        <>
          {/* === Mini-mapa SVG === */}
          <div className="px-5">
            <div className="rounded-md border border-white/10 bg-black/40 p-2">
              <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="block w-full h-auto">
                {comunas.map((c) => {
                  const intensity = intensities.get(c.id) ?? 0;
                  const isHover = hoverComunaId === c.id;
                  const isSel = selectedDepId === c.id;
                  return (
                    <path
                      key={c.id}
                      d={c.path}
                      fill={colorFor(intensity)}
                      fillOpacity={isSel ? 0.95 : isHover ? 0.88 : 0.78}
                      stroke={isSel ? "#FFD04A" : isHover ? "#FFD04A" : "#06090F"}
                      strokeWidth={isSel ? 1.6 : isHover ? 1.2 : 0.5}
                      style={{ cursor: "pointer", transition: "fill-opacity 0.15s, stroke-width 0.15s" }}
                      onMouseEnter={() => setHoverComunaId(c.id)}
                      onMouseLeave={() => setHoverComunaId((cur) => (cur === c.id ? null : cur))}
                      onClick={() => onSelectComuna(c.id)}
                    >
                      <title>{c.nombre}</title>
                    </path>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* === Stats CABA agregados === */}
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/10 px-5 pt-3">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-300/85">
                {isAll ? "Tasa avg" : "Tasa /100k"}
              </div>
              <div className="mt-0.5 text-[18px] font-semibold leading-none tracking-tight text-white num">
                {isAll ? "—" : tasaCaba.toLocaleString("es-AR", { maximumFractionDigits: 1 })}
              </div>
              <div className="mt-0.5 text-[9.5px] text-white/45">{isAll ? "" : "/100k hab."}</div>
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/45">Hechos</div>
              <div className="mt-0.5 text-[18px] font-semibold leading-none tracking-tight text-white num">
                {hechosCaba.toLocaleString("es-AR")}
              </div>
              <div className="mt-0.5 text-[9.5px] text-white/45">{isAll ? "SNIC total" : "del filtro"}</div>
            </div>
          </div>

          {/* === Lista 15 comunas === */}
          <div className="mt-4 border-t border-white/10 px-5 pb-4 pt-3">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-amber-300/85">
                Comunas · ordenadas desc
              </div>
              <div className="text-[8.5px] uppercase tracking-[0.16em] text-white/35 mono">{anio}</div>
            </div>
            <ul className="space-y-2">
              {sortedList.map((c) => {
                const isSel = selectedDepId === c.id;
                const isHover = hoverComunaId === c.id;
                const widthPct = maxValue > 0 ? (c.value / maxValue) * 100 : 0;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => onSelectComuna(c.id)}
                      onMouseEnter={() => setHoverComunaId(c.id)}
                      onMouseLeave={() => setHoverComunaId((cur) => (cur === c.id ? null : cur))}
                      className={`group flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition ${isSel ? "bg-amber-300/10" : isHover ? "bg-white/5" : "hover:bg-white/5"}`}
                    >
                      <span className={`min-w-0 flex-1 truncate text-[12px] ${isSel ? "text-white" : "text-white/85"}`}>
                        {c.nombre}
                      </span>
                      <span className="relative h-1 w-[100px] overflow-hidden rounded-full bg-white/10">
                        <span
                          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-300 to-amber-100"
                          style={{ width: `${widthPct}%` }}
                        />
                      </span>
                      <span className="w-[58px] text-right text-[11.5px] font-semibold text-white num mono">
                        {c.value.toLocaleString("es-AR", { maximumFractionDigits: metric === "tasa" ? 1 : 0 })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
