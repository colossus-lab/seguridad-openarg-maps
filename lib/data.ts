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

export async function loadHexgridPais(): Promise<GeoJSON.FeatureCollection> {
  if (geomCache.has("hex-pais")) return geomCache.get("hex-pais")!;
  const res = await fetch("/data/hexgrid-pais.geojson");
  if (!res.ok) throw new Error(`No pude cargar hexgrid-pais: ${res.status}`);
  const fc: GeoJSON.FeatureCollection = await res.json();
  geomCache.set("hex-pais", fc);
  return fc;
}

export async function loadDepartamentos(provinciaId: string): Promise<GeoJSON.FeatureCollection> {
  const key = `deps-${provinciaId}`;
  if (geomCache.has(key)) return geomCache.get(key)!;
  const res = await fetch(`/data/departamentos/${provinciaId}.geojson`);
  if (!res.ok) throw new Error(`No pude cargar departamentos ${provinciaId}: ${res.status}`);
  const fc: GeoJSON.FeatureCollection = await res.json();
  geomCache.set(key, fc);
  return fc;
}

export async function loadHexgridProvincia(provinciaId: string): Promise<GeoJSON.FeatureCollection> {
  const key = `hex-${provinciaId}`;
  if (geomCache.has(key)) return geomCache.get(key)!;
  const res = await fetch(`/data/hexgrid/${provinciaId}.geojson`);
  if (!res.ok) throw new Error(`No pude cargar hexgrid ${provinciaId}: ${res.status}`);
  const fc: GeoJSON.FeatureCollection = await res.json();
  geomCache.set(key, fc);
  return fc;
}
