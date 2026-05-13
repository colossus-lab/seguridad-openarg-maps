"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/lib/store";
import { loadDataset, loadPaisGeojson, loadDepartamentosAll } from "@/lib/data";
import Vista3DPais from "./Vista3DPais";
import IntroScreen from "./IntroScreen";
import ThemeToggleEditorial from "./ThemeToggleEditorial";

export default function DashboardShell() {
  const { dataset, setDataset, intro, setIntro } = useDashboard();
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<string>("Iniciando…");

  useEffect(() => {
    if (dataset) return;
    let cancelled = false;
    (async () => {
      // Pesos del loading (suman 1):
      //   dataset JSON (3 MB)        → 30%
      //   pais.geojson (190 KB)      → 5%
      //   555 departamentos (1.5 MB) → 50%
      //   render + idle del mapa     → 15%
      const W_DATA = 0.30, W_GEO = 0.05, W_DEPS = 0.50;

      const set = (p: number, label?: string) => {
        if (cancelled) return;
        setProgress((cur) => Math.max(cur, p));
        if (label) setPhase(label);
      };

      set(0.02, "Conectando con SNIC");
      const ds = await loadDataset();
      set(W_DATA, "Microdatos departamentales");
      if (cancelled) return;
      setDataset(ds);

      const geo = await loadPaisGeojson();
      void geo;
      set(W_DATA + W_GEO, "Provincias IGN");
      if (cancelled) return;

      set(W_DATA + W_GEO + 0.01, "555 departamentos · 0%");
      await loadDepartamentosAll((loaded, total) => {
        if (cancelled) return;
        const ratio = total > 0 ? loaded / total : 1;
        const pct = Math.round(ratio * 100);
        set(W_DATA + W_GEO + ratio * W_DEPS, `555 departamentos · ${pct}%`);
      });
      set(W_DATA + W_GEO + W_DEPS, "Compilando cartografía");
      // Final gating: Vista3DPais.onMapReady → setIntro("ready") al disparar 'idle'.
    })().catch((e) => {
      console.error(e);
      if (!cancelled) setPhase("Error al cargar datos");
    });
    return () => { cancelled = true; };
  }, [dataset, setDataset, setIntro]);

  const onMapReady = () => {
    setProgress(1);
    setIntro("ready");
  };

  return (
    <>
      {intro !== "done" && <IntroScreen progress={progress} phase={phase} />}
      {dataset && <Vista3DPais onMapReady={onMapReady} />}
      <ThemeToggleEditorial />
    </>
  );
}
