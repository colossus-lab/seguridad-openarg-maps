"use client";

import { useMemo, useState } from "react";
import MapGL, { Layer, Source } from "react-map-gl/maplibre";
import type { Dataset, Metric } from "@/lib/types";
import { totalProvincia } from "@/lib/analytics";

// Style minimal navy para el inset MapGL — mismo background que el mapa principal.
const INSET_STYLE: any = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {},
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#06090F" } },
  ],
};

type Props = {
  dataset: Dataset;
  depsGeo: GeoJSON.FeatureCollection | null;
  valoresDep: Map<string, number>;
  delitoId: string;
  anio: number;
  metric: Metric;
  isMobile: boolean;
  collapsed: boolean;             // true cuando hay departamentoSel CABA → header solo
  onClose: () => void;
  onSelectComuna: (id: string) => void;
  selectedDepId: string | null;
};

export default function CABAInset({
  dataset, depsGeo, valoresDep, delitoId, anio, metric,
  isMobile, collapsed, onClose, onSelectComuna, selectedDepId,
}: Props) {
  const [hoverComunaId, setHoverComunaId] = useState<string | null>(null);

  // FeatureCollection con las 15 comunas + intensity local.
  const comunasFC = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!depsGeo) return null;
    const features = depsGeo.features.filter(
      (f) => (f.properties as any)?.provincia_id === "02"
    );
    const values = features.map(
      (f) => valoresDep.get((f.properties as any).departamento_id) ?? 0
    );
    const positives = values.filter((v) => v > 0).slice().sort((a, b) => a - b);
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
    const enriched = features.map((f, i) => ({
      type: "Feature" as const,
      geometry: f.geometry,
      properties: {
        ...(f.properties ?? {}),
        value: values[i],
        intensity: pct(values[i]),
      },
    }));
    return { type: "FeatureCollection", features: enriched };
  }, [depsGeo, valoresDep]);

  // Lista de comunas para el panel inferior, ordenada desc por valor.
  const comunasList = useMemo(() => {
    if (!depsGeo) return [];
    return depsGeo.features
      .filter((f) => (f.properties as any)?.provincia_id === "02")
      .map((f) => {
        const props = f.properties as any;
        return {
          id: props.departamento_id as string,
          nombre: (props.nombre as string) ?? props.departamento_id,
          value: valoresDep.get(props.departamento_id) ?? 0,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [depsGeo, valoresDep]);

  const maxValue = comunasList[0]?.value ?? 1;

  // Stats agregados de CABA (provincia "02").
  const provIdx = useMemo(
    () => dataset.provincias.findIndex((p) => p.id === "02"),
    [dataset]
  );
  const ai = useMemo(() => dataset.anios.indexOf(anio), [dataset, anio]);
  const isAll = delitoId === "all";
  const di = isAll ? -1 : dataset.delitos.findIndex((d) => d.id === delitoId);
  const tasaCaba = isAll
    ? 0
    : di >= 0
      ? dataset.prov_tasa[provIdx]?.[di]?.[ai] ?? 0
      : 0;
  const hechosCaba = isAll
    ? totalProvincia(dataset, provIdx, ai, "hechos")
    : di >= 0
      ? dataset.prov_hechos[provIdx]?.[di]?.[ai] ?? 0
      : 0;

  const containerCls = isMobile
    ? "pointer-events-auto fixed inset-x-0 bottom-0 z-30 max-h-[88vh] overflow-y-auto rounded-t-2xl border-t border-amber-300/30 bg-black/92 px-5 pb-6 pt-3 backdrop-blur-md anim-fade-up"
    : `pointer-events-auto absolute right-6 top-[100px] z-30 w-[400px] rounded-2xl border border-amber-300/30 bg-black/82 backdrop-blur-md anim-fade-up transition-all duration-300 ${collapsed ? "max-h-[64px] overflow-hidden" : "max-h-[calc(100vh-160px)] overflow-y-auto"}`;

  return (
    <div className={containerCls}>
      {/* === Header === */}
      <div className="flex items-start justify-between gap-2 px-5 pb-3 pt-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-amber-300/85">
            Inset · Ciudad Autónoma
          </div>
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
          {/* === Mini-mapa MapGL real === */}
          <div className="px-5">
            <div className="overflow-hidden rounded-md border border-white/10 bg-black/40">
              <div style={{ width: "100%", height: 320 }}>
                <MapGL
                  initialViewState={{
                    longitude: -58.444,
                    latitude: -34.611,
                    zoom: 10.6,
                    pitch: 0,
                    bearing: 0,
                  }}
                  mapStyle={INSET_STYLE}
                  minZoom={10}
                  maxZoom={13}
                  maxBounds={[[-58.55, -34.72], [-58.32, -34.52]]}
                  dragRotate={false}
                  touchPitch={false}
                  style={{ width: "100%", height: "100%", background: "#06090F" }}
                  interactiveLayerIds={["caba-comunas-fill"]}
                  cursor={hoverComunaId ? "pointer" : "default"}
                  onMouseMove={(e) => {
                    const id = (e.features?.[0]?.properties as any)?.departamento_id;
                    setHoverComunaId(id ?? null);
                  }}
                  onMouseLeave={() => setHoverComunaId(null)}
                  onClick={(e) => {
                    const id = (e.features?.[0]?.properties as any)?.departamento_id;
                    if (id) onSelectComuna(id);
                  }}
                >
                  {comunasFC && (
                    <Source id="caba-comunas" type="geojson" data={comunasFC}>
                      <Layer
                        id="caba-comunas-fill"
                        type="fill"
                        paint={{
                          "fill-color": [
                            "interpolate", ["linear"], ["get", "intensity"],
                            0, "#3D4A66", 0.2, "#5C7FB0", 0.4, "#74ACDF",
                            0.6, "#FFD04A", 0.8, "#F6B40E", 1, "#C03A18",
                          ],
                          "fill-opacity": [
                            "case",
                            ["==", ["get", "departamento_id"], selectedDepId ?? "__none__"], 0.95,
                            ["==", ["get", "departamento_id"], hoverComunaId ?? "__none__"], 0.88,
                            0.78,
                          ],
                        }}
                      />
                      <Layer
                        id="caba-comunas-line"
                        type="line"
                        paint={{
                          "line-color": "#06090F",
                          "line-width": 0.8,
                          "line-opacity": 0.6,
                        }}
                      />
                      <Layer
                        id="caba-comunas-active"
                        type="line"
                        paint={{
                          "line-color": [
                            "case",
                            ["==", ["get", "departamento_id"], selectedDepId ?? "__none__"], "#FFD04A",
                            ["==", ["get", "departamento_id"], hoverComunaId ?? "__none__"], "#FFD04A",
                            "rgba(0,0,0,0)",
                          ],
                          "line-width": 1.8,
                          "line-opacity": 1,
                        }}
                      />
                    </Source>
                  )}
                </MapGL>
              </div>
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
              {comunasList.map((c) => {
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
