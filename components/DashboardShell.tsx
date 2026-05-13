"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/lib/store";
import { loadDataset, loadPaisGeojson, loadHexgridPais } from "@/lib/data";
import Vista3DPais from "./Vista3DPais";
import IntroScreen from "./IntroScreen";

export default function DashboardShell() {
  const { dataset, setDataset, intro, setIntro } = useDashboard();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (dataset) return;
    let cancelled = false;
    (async () => {
      const tick = (p: number) => { if (!cancelled) setProgress((cur) => Math.max(cur, p)); };
      tick(0.05);
      const ds = await loadDataset();
      tick(0.4);
      if (cancelled) return;
      setDataset(ds);
      const [_g, _h] = await Promise.all([loadPaisGeojson(), loadHexgridPais()]);
      void _g; void _h;
      tick(1);
      if (!cancelled) setIntro("ready");
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [dataset, setDataset, setIntro]);

  return (
    <>
      {intro !== "done" && <IntroScreen progress={progress} />}
      {dataset && <Vista3DPais />}
    </>
  );
}
