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
  cabaInsetOpen: boolean;
  setDataset: (d: Dataset) => void;
  setDelito: (id: string) => void;
  setAnio: (a: number) => void;
  setMetric: (m: Metric) => void;
  selectProvincia: (id: string | null) => void;
  selectDepartamento: (id: string | null) => void;
  setIntro: (s: IntroState) => void;
  setCabaInset: (open: boolean) => void;
  reset: () => void;
};

export const useDashboard = create<State>((set) => ({
  dataset: null,
  provinciaSel: null,
  departamentoSel: null,
  delitoId: "all",
  anio: 2024,
  metric: "tasa",
  intro: "loading",
  cabaInsetOpen: false,
  setDataset: (d) => set((s) => ({
    dataset: d,
    anio: d.anios[d.anios.length - 1] ?? s.anio,
    delitoId: s.delitoId === "all" ? "all" : (d.delitos.find((x) => x.id === s.delitoId)?.id ?? "all"),
  })),
  setDelito: (id) => set({ delitoId: id }),
  setAnio: (a) => set({ anio: a }),
  setMetric: (m) => set({ metric: m }),
  selectProvincia: (id) => set({ provinciaSel: id, departamentoSel: null, cabaInsetOpen: false }),
  selectDepartamento: (id) => set({ departamentoSel: id }),
  setIntro: (s) => set({ intro: s }),
  setCabaInset: (open) => set((s) => ({
    cabaInsetOpen: open,
    departamentoSel: open ? s.departamentoSel : null,
  })),
  reset: () => set({ provinciaSel: null, departamentoSel: null, cabaInsetOpen: false }),
}));
