import { create } from "zustand";
import type { Dataset, Metric } from "./types";

type IntroState = "loading" | "ready" | "done";

type State = {
  dataset: Dataset | null;
  provinciaSel: string | null;
  departamentoSel: string | null;
  delitoId: string;
  anio: number;
  metric: Metric;
  intro: IntroState;
  setDataset: (d: Dataset) => void;
  setDelito: (id: string) => void;
  setAnio: (a: number) => void;
  setMetric: (m: Metric) => void;
  selectProvincia: (id: string | null) => void;
  selectDepartamento: (id: string | null) => void;
  setIntro: (s: IntroState) => void;
  reset: () => void;
};

export const useDashboard = create<State>((set) => ({
  dataset: null,
  provinciaSel: null,
  departamentoSel: null,
  delitoId: "1",
  anio: 2024,
  metric: "tasa",
  intro: "loading",
  setDataset: (d) => set((s) => ({
    dataset: d,
    anio: d.anios[d.anios.length - 1] ?? s.anio,
    delitoId: d.delitos.find((x) => x.id === s.delitoId)?.id ?? d.delitos[0]?.id ?? "1",
  })),
  setDelito: (id) => set({ delitoId: id }),
  setAnio: (a) => set({ anio: a }),
  setMetric: (m) => set({ metric: m }),
  selectProvincia: (id) => set({ provinciaSel: id, departamentoSel: null }),
  selectDepartamento: (id) => set({ departamentoSel: id }),
  setIntro: (s) => set({ intro: s }),
  reset: () => set({ provinciaSel: null, departamentoSel: null }),
}));
