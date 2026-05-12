"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboard } from "@/lib/store";
import { loadDataset, loadPaisGeojson, loadHexgridPais } from "@/lib/data";
import Vista3DPais from "./Vista3DPais";
import IntroScreen from "./IntroScreen";

export default function DashboardShell() {
  const { dataset, setDataset, intro, setIntro } = useDashboard();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (intro === "done" || dataset) return;
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
  }, [dataset, setDataset, setIntro, intro]);

  const rango = dataset ? `${dataset.anios[0]}–${dataset.anios[dataset.anios.length - 1]}` : "";

  return (
    <>
      {intro !== "done" && <IntroScreen progress={progress} />}
      {dataset && (
        <div className="min-h-screen">
          {/* Top bar */}
          <header className="sticky top-0 z-30 gradient-line-bottom relative border-b border-line-subtle/40 bg-paper/70 backdrop-blur-xl">
            <div className="mx-auto flex max-w-[1320px] items-center justify-between px-8 py-3.5">
              <div className="flex items-center gap-3">
                <span className="relative inline-flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-emerald-500 halo-expand" />
                  <span className="absolute inset-0 rounded-full bg-emerald-500" />
                </span>
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-ink">
                  Colossus Lab
                </span>
                <span className="h-3 w-px bg-line" />
                <span className="text-[10.5px] uppercase tracking-[0.24em] text-ink-3">
                  Observatorio · Seguridad
                </span>
              </div>
              <nav className="flex items-center gap-6 text-[11.5px] text-ink-2">
                <a href="https://www.colossuslab.org" target="_blank" rel="noreferrer" className="transition hover:text-ink">
                  colossuslab.org
                </a>
                <a
                  href="https://www.argentina.gob.ar/seguridad/estadisticascriminales"
                  target="_blank"
                  rel="noreferrer"
                  className="transition hover:text-ink"
                >
                  Fuente SNIC ↗
                </a>
              </nav>
            </div>
          </header>

          {/* Hero */}
          <section className="relative overflow-hidden border-b border-line-subtle">
            <div className="absolute inset-0 paper-grid opacity-[0.32]" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
            <div className="relative mx-auto max-w-[1320px] px-8 py-14 md:py-20">
              <div className="anim-fade-up grid gap-12 md:grid-cols-[minmax(0,1fr)_360px] md:items-end">
                <div>
                  <div className="eyebrow mb-4 flex items-center gap-2.5 text-emerald-700">
                    <span className="inline-block h-1 w-6 bg-emerald-500" />
                    Open Arg · Panel Nacional · SNIC 2000–2024
                  </div>
                  <h1 className="text-[44px] font-semibold leading-[0.95] tracking-[-0.028em] text-ink md:text-[72px]">
                    Mapa de
                    <br />
                    inseguridad
                    <span className="block bg-gradient-to-br from-ink via-ink-2 to-ink-3 bg-clip-text text-transparent">
                      República Argentina
                    </span>
                  </h1>
                  <p className="mt-6 max-w-2xl text-[14.5px] leading-relaxed text-ink-2">
                    Observatorio interactivo 3D del Sistema Nacional de Información Criminal sobre{" "}
                    <strong className="text-ink">24 provincias</strong> y{" "}
                    <strong className="text-ink">{dataset.departamentos.length} departamentos</strong>.
                    Hacé click sobre una provincia para hacer drill-down al detalle departamental con
                    un hexgrid de mayor resolución.
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-6 border-l border-line-subtle pl-8 md:grid-cols-1 md:gap-y-5">
                  <StatTile label="Cobertura" target={dataset.provincias.length} suffix="provincias" detail={`${dataset.departamentos.length} departamentos`} delay={0} />
                  <StatTile label="Serie temporal" target={dataset.anios.length} suffix="años" detail={rango} delay={120} />
                  <StatTile label="Categorías" target={dataset.delitos.length} suffix="delitos" detail="SNIC + SAT viales" delay={240} />
                  <StatTile label="Resolución" target={555} suffix="hexes/prov." detail="hasta 0.6 km en CABA" delay={360} />
                </dl>
              </div>
            </div>
          </section>

          <main className="mx-auto max-w-[1320px] px-8 py-10">
            <Vista3DPais />
          </main>

          <footer className="mt-12 border-t border-line-subtle bg-paper/40">
            <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3 px-8 py-7 text-[11.5px] text-ink-3">
              <div>
                Elaborado por <span className="font-semibold text-ink">Colossus Lab</span> · Datos
                oficiales del Ministerio de Seguridad de la Nación (SNIC + SAT) · Geometrías IGN
              </div>
              <div className="mono text-[10.5px]">
                build {new Date(dataset.meta.generado).toISOString().slice(0, 10)}
              </div>
            </div>
          </footer>
        </div>
      )}
    </>
  );
}

function StatTile({ label, target, suffix, detail, delay }: { label: string; target: number; suffix: string; detail: string; delay: number }) {
  const [val, setVal] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t0 = performance.now();
    const dur = 900;
    const startDelay = delay;
    let raf = 0;
    const id = setTimeout(() => {
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0 - startDelay) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        setVal(Math.round(target * eased));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, startDelay);
    return () => { clearTimeout(id); cancelAnimationFrame(raf); };
  }, [target, delay]);

  return (
    <div className="count-tick">
      <div className="eyebrow">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <div className="num text-[32px] font-semibold leading-none tracking-[-0.02em] text-ink">{val}</div>
        <div className="text-[11px] text-ink-3">{suffix}</div>
      </div>
      <div className="mt-1 text-[10.5px] text-ink-3 mono">{detail}</div>
    </div>
  );
}
