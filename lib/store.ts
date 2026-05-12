import { create } from "zustand";
import type { Dataset, Metric, Nivel } from "./types";

type State = {
  dataset: Dataset | null;
  nivel: Nivel;
  provinciaSel: string | null;
  departamentoSel: string | null;
  delitoId: string;
  anio: number;
  metric: Metric;
  setDataset: (d: Dataset) => void;
  setDelito: (id: string) => void;
  setAnio: (a: number) => void;
  setMetric: (m: Metric) => void;
  selectProvincia: (id: string | null) => void;
  selectDepartamento: (id: string | null) => void;
  reset: () => void;
};

export const useDashboard = create<State>((set) => ({
  dataset: null,
  nivel: "pais",
  provinciaSel: null,
  departamentoSel: null,
  delitoId: "1", // Homicidios dolosos por defecto
  anio: 2024,
  metric: "tasa",
  setDataset: (d) => set((s) => ({
    dataset: d,
    anio: d.anios[d.anios.length - 1] ?? s.anio,
    delitoId: d.delitos.find((x) => x.id === s.delitoId)?.id ?? d.delitos[0]?.id ?? "1",
  })),
  setDelito: (id) => set({ delitoId: id }),
  setAnio: (a) => set({ anio: a }),
  setMetric: (m) => set({ metric: m }),
  selectProvincia: (id) => set({
    nivel: id ? "provincia" : "pais",
    provinciaSel: id,
    departamentoSel: null,
  }),
  selectDepartamento: (id) => set({ departamentoSel: id }),
  reset: () => set({ nivel: "pais", provinciaSel: null, departamentoSel: null }),
}));
