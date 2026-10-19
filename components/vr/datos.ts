import type { VRBundle } from "@/lib/types";

// Escala de color del sitio (components/Vista3DPais.tsx → CINDER), en sRGB 0–1.
export const CINDER = ["#3D4A66", "#5C7FB0", "#8FBEEA", "#FFD04A", "#F6B40E", "#C03A18"];
export const SIN_DATO_COLOR = "#2A3240";
export const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Altura máxima de una columna (en el p99 de la serie), en metros. */
export const ALTURA_MAX = 0.14;

/** Tasa (por 100k) de un depto, o null si no reportó ese año. */
export function tasa(b: VRBundle, delitoIdx: number, anioIdx: number, dep: number): number | null {
  const nDep = b.meta.departamentos.length;
  const q = b.values[(delitoIdx * b.meta.anios.length + anioIdx) * nDep + dep];
  if (q === b.meta.sinDato) return null;
  return (q / 65534) * b.meta.delitos[delitoIdx].max;
}

/** Percentil (0–1) de un valor contra todos los deptos y años del delito. */
export function intensidad(quantiles: number[], v: number): number {
  if (v <= 0) return 0;
  const n = quantiles.length - 1;
  let lo = 0, hi = n;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (quantiles[m] < v) lo = m + 1; else hi = m;
  }
  if (lo === 0) return 0.02;
  // Interpolación dentro del tramo para que el color no salte en escalones.
  const a = quantiles[lo - 1], b = quantiles[lo];
  const f = b > a ? (v - a) / (b - a) : 1;
  return Math.max(0.02, (lo - 1 + f) / n);
}

/** Altura de columna: raíz para comprimir la cola, tope a 1,25 × p99. */
export function altura(p99: number, v: number | null): number {
  if (v == null || v <= 0 || p99 <= 0) return 0;
  return ALTURA_MAX * Math.sqrt(Math.min(v / p99, 1.25));
}

const fmt1 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmt0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
export const fmtTasa = (v: number) => (v >= 1000 ? fmt0.format(v) : fmt1.format(v));
export const fmtPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt1.format(Math.abs(v))} %`;
