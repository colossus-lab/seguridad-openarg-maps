import { create } from "zustand";

// Estado de la experiencia /vr. Separado del store del dashboard (lib/store.ts).
type VRState = {
  delitoIdx: number;
  anioIdx: number;
  provinciaId: string | null;
  /** índice de depto en meta.departamentos */
  depSel: number | null;
  depHover: number | null;
  playing: boolean;
  /** modo "ubicar en mesa" (hit-test, solo AR) */
  placing: boolean;
  setDelito: (i: number) => void;
  setAnio: (i: number) => void;
  setProvincia: (id: string | null) => void;
  setDepSel: (i: number | null) => void;
  setDepHover: (i: number | null) => void;
  setPlaying: (p: boolean) => void;
  setPlacing: (p: boolean) => void;
};

export const useVR = create<VRState>((set) => ({
  delitoIdx: 0,
  anioIdx: 0,
  provinciaId: null,
  depSel: null,
  depHover: null,
  playing: false,
  placing: false,
  setDelito: (i) => set({ delitoIdx: i }),
  setAnio: (i) => set({ anioIdx: i }),
  setProvincia: (id) => set({ provinciaId: id, depHover: null }),
  setDepSel: (i) => set({ depSel: i }),
  setDepHover: (i) => set({ depHover: i }),
  setPlaying: (p) => set({ playing: p }),
  setPlacing: (p) => set({ placing: p }),
}));
