// IDW interpolation + isoband generation para el "halo térmico" detrás del choropleth.
// Toma centroides + valor por departamento, los interpola sobre una grilla regular, y
// extrae 6 isobandas con turf.

import * as turf from "@turf/turf";

type Point = { lon: number; lat: number; v: number };

/**
 * IDW (inverse-distance weighting) sobre una grilla regular.
 * Cada cell del grid se estima como el promedio ponderado de los K vecinos más cercanos
 * con peso 1/d^p.
 */
function idwGrid(
  points: Point[],
  bbox: [number, number, number, number],
  cols: number,
  rows: number,
  k = 8,
  p = 2,
): { features: GeoJSON.Feature<GeoJSON.Point, { v: number }>[]; cellLon: number; cellLat: number } {
  const [minX, minY, maxX, maxY] = bbox;
  const cellLon = (maxX - minX) / cols;
  const cellLat = (maxY - minY) / rows;
  const features: GeoJSON.Feature<GeoJSON.Point, { v: number }>[] = [];

  // Pre-cuadrar puntos válidos
  const valid = points.filter((p) => Number.isFinite(p.v));

  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const lon = minX + c * cellLon;
      const lat = minY + r * cellLat;
      // K-nearest por distancia euclídea en grados (suficiente para país escala)
      const dists = valid.map((pt) => {
        const dx = pt.lon - lon;
        const dy = pt.lat - lat;
        return { d2: dx * dx + dy * dy, v: pt.v };
      });
      dists.sort((a, b) => a.d2 - b.d2);
      const top = dists.slice(0, k);
      let num = 0, den = 0;
      for (const t of top) {
        if (t.d2 < 1e-10) { num = t.v; den = 1; break; }
        const w = 1 / Math.pow(t.d2, p / 2);
        num += w * t.v;
        den += w;
      }
      features.push({
        type: "Feature",
        properties: { v: den > 0 ? num / den : 0 },
        geometry: { type: "Point", coordinates: [lon, lat] },
      });
    }
  }
  return { features, cellLon, cellLat };
}

/**
 * Calcula percentiles dados de un array de valores positivos.
 */
function percentiles(values: number[], breaks: number[]): number[] {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).slice().sort((a, b) => a - b);
  if (v.length === 0) return breaks.map(() => 0);
  const q = (p: number) => {
    const idx = (v.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return v[lo];
    const h = idx - lo;
    return v[lo] * (1 - h) + v[hi] * h;
  };
  return breaks.map((p) => q(p));
}

/**
 * Computa isobandas para una distribución de valores por punto (centroides).
 * Si se pasa `clipTo`, las isobandas se intersectan con ese polígono (típicamente
 * el contorno de Argentina) para que el halo no se desborde a océanos o vecinos.
 * Retorna FeatureCollection con 6 polígonos etiquetados con `intensity` 0..1.
 */
export function computeIsobands(
  points: Point[],
  bbox: [number, number, number, number],
  clipTo?: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
  if (points.length === 0) return { type: "FeatureCollection", features: [] };
  const grid = idwGrid(points, bbox, 80, 60, 8, 2);
  const gridFC: GeoJSON.FeatureCollection<GeoJSON.Point, { v: number }> = {
    type: "FeatureCollection",
    features: grid.features,
  };
  const vals = grid.features.map((f) => f.properties.v);
  const breaks = percentiles(vals, [0.0, 0.18, 0.38, 0.58, 0.78, 0.95]);
  for (let i = 1; i < breaks.length; i++) {
    if (breaks[i] <= breaks[i - 1]) breaks[i] = breaks[i - 1] + 1e-6;
  }
  const isobands = turf.isobands(gridFC as any, breaks, { zProperty: "v" }) as any;
  const N = isobands.features.length;
  isobands.features.forEach((f: any, i: number) => {
    f.properties = { intensity: N > 1 ? i / (N - 1) : 0 };
  });

  if (!clipTo || clipTo.features.length === 0) return isobands as GeoJSON.FeatureCollection;

  // Construir un solo Feature unión de todas las provincias para clipear (más eficiente).
  let combined: any = null;
  for (const f of clipTo.features) {
    if (!combined) combined = f;
    else {
      try { combined = turf.union(combined as any, f as any); }
      catch { /* mantener anterior */ }
    }
  }
  if (!combined) return isobands as GeoJSON.FeatureCollection;

  const clipped: any[] = [];
  for (const band of isobands.features) {
    try {
      const inter = turf.intersect(band as any, combined as any);
      if (inter) { inter.properties = band.properties; clipped.push(inter); }
    } catch { /* skip */ }
  }
  return { type: "FeatureCollection", features: clipped };
}
