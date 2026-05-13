import type { Dataset } from "./types";

let cachedDataset: Dataset | null = null;
const geomCache = new Map<string, GeoJSON.FeatureCollection>();

export async function loadDataset(): Promise<Dataset> {
  if (cachedDataset) return cachedDataset;
  const res = await fetch("/data/pais.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`No pude cargar dataset: ${res.status}`);
  cachedDataset = await res.json();
  return cachedDataset!;
}

export async function loadPaisGeojson(): Promise<GeoJSON.FeatureCollection> {
  if (geomCache.has("pais")) return geomCache.get("pais")!;
  const res = await fetch("/data/pais.geojson");
  if (!res.ok) throw new Error(`No pude cargar pais.geojson: ${res.status}`);
  const fc: GeoJSON.FeatureCollection = await res.json();
  geomCache.set("pais", fc);
  return fc;
}

export async function loadDepartamentosAll(
  onProgress?: (loaded: number, total: number) => void,
): Promise<GeoJSON.FeatureCollection> {
  if (geomCache.has("deps-all")) {
    onProgress?.(1, 1);
    return geomCache.get("deps-all")!;
  }
  const res = await fetch("/data/departamentos.geojson");
  if (!res.ok) throw new Error(`No pude cargar departamentos.geojson: ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !onProgress || total === 0) {
    const fc: GeoJSON.FeatureCollection = await res.json();
    geomCache.set("deps-all", fc);
    return fc;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  const buf = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) { buf.set(c, offset); offset += c.byteLength; }
  const fc: GeoJSON.FeatureCollection = JSON.parse(new TextDecoder("utf-8").decode(buf));
  geomCache.set("deps-all", fc);
  return fc;
}
