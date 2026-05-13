"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/lib/store";
import { loadDataset, loadPaisGeojson, loadHexgridPais } from "@/lib/data";
import Vista3DPais from "./Vista3DPais";
import IntroScreen from "./IntroScreen";

export default function DashboardShell() {
  const { dataset, setDataset, intro, setIntro } = useDashboard();
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<string>("Iniciando…");

  useEffect(() => {
    if (dataset) return;
    let cancelled = false;
    (async () => {
      // Pesos de cada fase del loading (suman 1):
      //   dataset JSON (3 MB)      → 22%
      //   pais.geojson (180 KB)    → 3%
      //   hexgrid-pais (13 MB) ETL → 60%
      //   render & idle del mapa   → 15%
      const W_DATA = 0.22, W_GEO = 0.03, W_HEX = 0.60;

      const set = (p: number, label?: string) => {
        if (cancelled) return;
        setProgress((cur) => Math.max(cur, p));
        if (label) setPhase(label);
      };

      set(0.02, "Conectando con SNIC…");
      const ds = await loadDataset();
      set(W_DATA, "Estadísticas departamentales");
      if (cancelled) return;
      setDataset(ds);

      const geo = await loadPaisGeojson();
      void geo;
      set(W_DATA + W_GEO, "Geometrías IGN");
      if (cancelled) return;

      set(W_DATA + W_GEO + 0.01, "Cargando hexgrid · 0%");
      await loadHexgridPais((loaded, total) => {
        if (cancelled) return;
        const ratio = total > 0 ? loaded / total : 1;
        const pct = Math.round(ratio * 100);
        set(W_DATA + W_GEO + ratio * W_HEX, `Cargando hexgrid · ${pct}%`);
      });
      set(W_DATA + W_GEO + W_HEX, "Compilando 14 mil hexágonos");
      // El gating final lo hace Vista3DPais al recibir 'idle' del mapa.
      // setIntro("ready") se llama desde allí.
    })().catch((e) => {
      console.error(e);
      if (!cancelled) setPhase("Error al cargar datos");
    });
    return () => { cancelled = true; };
  }, [dataset, setDataset, setIntro]);

  // Cuando Vista3D nos avise que el mapa está idle, completamos el progreso.
  const onMapReady = () => {
    setProgress(1);
    setIntro("ready");
  };

  return (
    <>
      {intro !== "done" && <IntroScreen progress={progress} phase={phase} />}
      {dataset && <Vista3DPais onMapReady={onMapReady} />}
    </>
  );
}
