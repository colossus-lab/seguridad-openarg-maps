import type { Dataset, Metric } from "./types";

export function valorProvincia(
  ds: Dataset,
  provIdx: number,
  delitoIdx: number,
  anioIdx: number,
  metric: Metric,
): number {
  if (provIdx < 0 || delitoIdx < 0 || anioIdx < 0) return 0;
  const mat = metric === "tasa" ? ds.prov_tasa : ds.prov_hechos;
  return mat[provIdx]?.[delitoIdx]?.[anioIdx] ?? 0;
}

export function valorDepartamento(
  ds: Dataset,
  depIdx: number,
  delitoIdx: number,
  anioIdx: number,
  metric: Metric,
): number {
  if (depIdx < 0 || delitoIdx < 0 || anioIdx < 0) return 0;
  const mat = metric === "tasa" ? ds.dep_tasa : ds.dep_hechos;
  return mat[depIdx]?.[delitoIdx]?.[anioIdx] ?? 0;
}

/** Total agregado de todos los delitos para una provincia en un año (hechos o tasa promedio). */
export function totalProvincia(ds: Dataset, provIdx: number, anioIdx: number, metric: Metric): number {
  if (provIdx < 0 || anioIdx < 0) return 0;
  let s = 0;
  for (let di = 0; di < ds.delitos.length; di++) s += valorProvincia(ds, provIdx, di, anioIdx, metric);
  return s;
}

/** Total agregado de todos los delitos para un departamento en un año. */
export function totalDepartamento(ds: Dataset, depIdx: number, anioIdx: number, metric: Metric): number {
  if (depIdx < 0 || anioIdx < 0) return 0;
  let s = 0;
  for (let di = 0; di < ds.delitos.length; di++) s += valorDepartamento(ds, depIdx, di, anioIdx, metric);
  return s;
}

/** Agregado nacional de un delito en un año. */
export function totalNacional(ds: Dataset, delitoIdx: number, anioIdx: number, metric: Metric): number {
  if (anioIdx < 0) return 0;
  if (delitoIdx >= 0) {
    if (metric === "hechos") {
      let s = 0;
      for (let pi = 0; pi < ds.provincias.length; pi++) s += ds.prov_hechos[pi][delitoIdx][anioIdx] ?? 0;
      return s;
    }
    // Tasa nacional: promedio ponderado por hechos.
    let w = 0, h = 0;
    for (let pi = 0; pi < ds.provincias.length; pi++) {
      const hi = ds.prov_hechos[pi][delitoIdx][anioIdx] ?? 0;
      const ti = ds.prov_tasa[pi][delitoIdx][anioIdx] ?? 0;
      if (hi > 0) { w += ti * hi; h += hi; }
    }
    return h > 0 ? w / h : 0;
  }
  // delitoIdx < 0 → "all"
  let s = 0;
  for (let di = 0; di < ds.delitos.length; di++) s += totalNacional(ds, di, anioIdx, "hechos");
  return s;
}
