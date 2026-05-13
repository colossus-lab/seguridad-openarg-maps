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

/** Top N delitos para una provincia (orden descendente por hechos). */
export function topNDelitosProvincia(
  ds: Dataset, provIdx: number, anioIdx: number, n = 5,
): { id: string; nombre: string; hechos: number; tasa: number; pct: number }[] {
  if (provIdx < 0 || anioIdx < 0) return [];
  const rows = ds.delitos.map((d, di) => ({
    id: d.id,
    nombre: d.nombre,
    hechos: ds.prov_hechos[provIdx]?.[di]?.[anioIdx] ?? 0,
    tasa: ds.prov_tasa[provIdx]?.[di]?.[anioIdx] ?? 0,
    pct: 0,
  }));
  const total = rows.reduce((s, r) => s + r.hechos, 0);
  rows.forEach((r) => { r.pct = total > 0 ? (r.hechos / total) * 100 : 0; });
  return rows.filter((r) => r.hechos > 0).sort((a, b) => b.hechos - a.hechos).slice(0, n);
}

/** Top N delitos para un departamento. */
export function topNDelitosDepartamento(
  ds: Dataset, depIdx: number, anioIdx: number, n = 5,
): { id: string; nombre: string; hechos: number; tasa: number; pct: number }[] {
  if (depIdx < 0 || anioIdx < 0) return [];
  const rows = ds.delitos.map((d, di) => ({
    id: d.id,
    nombre: d.nombre,
    hechos: ds.dep_hechos[depIdx]?.[di]?.[anioIdx] ?? 0,
    tasa: ds.dep_tasa[depIdx]?.[di]?.[anioIdx] ?? 0,
    pct: 0,
  }));
  const total = rows.reduce((s, r) => s + r.hechos, 0);
  rows.forEach((r) => { r.pct = total > 0 ? (r.hechos / total) * 100 : 0; });
  return rows.filter((r) => r.hechos > 0).sort((a, b) => b.hechos - a.hechos).slice(0, n);
}

/** Variación 5 años: tasa actual vs promedio de los 5 años previos. */
export function evolucion5Anios(
  serie: number[], anioIdx: number,
): { actual: number; promedio5: number; deltaPct: number | null } {
  const actual = serie[anioIdx] ?? 0;
  const from = Math.max(0, anioIdx - 5);
  const slice = serie.slice(from, anioIdx).filter((v) => v > 0);
  if (slice.length === 0) return { actual, promedio5: 0, deltaPct: null };
  const promedio5 = slice.reduce((a, b) => a + b, 0) / slice.length;
  if (promedio5 <= 0) return { actual, promedio5, deltaPct: null };
  return { actual, promedio5, deltaPct: ((actual - promedio5) / promedio5) * 100 };
}

/** Serie temporal de una provincia para (delito | "all", metric). */
export function serieProvincia(
  ds: Dataset, provIdx: number, delitoId: string | "all", metric: Metric,
): number[] {
  if (provIdx < 0) return [];
  return ds.anios.map((_a, ai) => {
    if (delitoId === "all") {
      let s = 0;
      for (let di = 0; di < ds.delitos.length; di++) s += valorProvincia(ds, provIdx, di, ai, metric);
      return s;
    }
    const di = ds.delitos.findIndex((d) => d.id === delitoId);
    return di < 0 ? 0 : valorProvincia(ds, provIdx, di, ai, metric);
  });
}

/** Serie temporal de un departamento (delito | "all", metric). */
export function serieDepartamento(
  ds: Dataset, depIdx: number, delitoId: string | "all", metric: Metric,
): number[] {
  if (depIdx < 0) return [];
  return ds.anios.map((_a, ai) => {
    if (delitoId === "all") {
      let s = 0;
      for (let di = 0; di < ds.delitos.length; di++) s += valorDepartamento(ds, depIdx, di, ai, metric);
      return s;
    }
    const di = ds.delitos.findIndex((d) => d.id === delitoId);
    return di < 0 ? 0 : valorDepartamento(ds, depIdx, di, ai, metric);
  });
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
