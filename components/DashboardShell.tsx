"use client";

import { useEffect } from "react";
import { useDashboard } from "@/lib/store";
import { loadDataset } from "@/lib/data";
import Vista3DPais from "./Vista3DPais";

export default function DashboardShell() {
  const { dataset, setDataset } = useDashboard();

  useEffect(() => {
    if (!dataset) loadDataset().then(setDataset).catch(console.error);
  }, [dataset, setDataset]);

  if (!dataset) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-dot" />
          <span className="eyebrow text-ink-3">Inicializando observatorio…</span>
        </div>
      </div>
    );
  }

  const rango = `${dataset.anios[0]}–${dataset.anios[dataset.anios.length - 1]}`;

  return (
    <div className="min-h-screen">
      {/* Top bar institucional */}
      <header className="sticky top-0 z-30 border-b border-line-subtle bg-paper/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between px-8 py-3.5">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 pulse-dot" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink">
              Colossus Lab
            </span>
            <span className="h-3 w-px bg-line" />
            <span className="text-[10.5px] uppercase tracking-[0.22em] text-ink-3">
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

      {/* Hero institucional */}
      <section className="relative overflow-hidden border-b border-line-subtle">
        <div className="absolute inset-0 paper-grid opacity-[0.35]" />
        <div className="relative mx-auto max-w-[1320px] px-8 py-12 md:py-16">
          <div className="anim-fade-up grid gap-10 md:grid-cols-[minmax(0,1fr)_320px] md:items-end">
            <div>
              <div className="eyebrow mb-3 text-emerald-700">
                Open Arg · Panel Nacional · SNIC 2000–2024
              </div>
              <h1 className="text-[40px] font-semibold leading-[0.98] tracking-[-0.025em] text-ink md:text-[56px]">
                Mapa de inseguridad
                <span className="block bg-gradient-to-r from-ink via-ink-2 to-ink-3 bg-clip-text text-transparent">
                  República Argentina
                </span>
              </h1>
              <p className="mt-5 max-w-2xl text-[14px] leading-relaxed text-ink-2">
                Observatorio interactivo 3D del Sistema Nacional de Información Criminal para las{" "}
                <strong className="text-ink">24 provincias</strong> y los{" "}
                <strong className="text-ink">{dataset.departamentos.length} departamentos</strong> de
                Argentina. Hacé click sobre una provincia para hacer drill-down al detalle departamental
                con un hexgrid de mayor resolución.
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-3 border-l border-line-subtle pl-8 md:grid-cols-1 md:gap-4">
              <Meta label="Cobertura" big={`${dataset.provincias.length}`} suffix="provincias" detail={`${dataset.departamentos.length} departamentos`} />
              <Meta label="Serie temporal" big={`${dataset.anios.length}`} suffix="años" detail={rango} />
              <Meta label="Categorías" big={`${dataset.delitos.length}`} suffix="delitos" detail="SNIC + SAT viales" />
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
            Elaborado por <span className="font-semibold text-ink">Colossus Lab</span> · Datos oficiales
            del Ministerio de Seguridad de la Nación (SNIC + SAT) · Geometrías IGN
          </div>
          <div className="mono text-[10.5px]">
            build {new Date(dataset.meta.generado).toISOString().slice(0, 10)}
          </div>
        </div>
      </footer>
    </div>
  );
}

function Meta({ label, big, suffix, detail }: { label: string; big: string; suffix: string; detail: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <div className="num text-[26px] font-semibold leading-none tracking-tight text-ink">{big}</div>
        <div className="text-[11px] text-ink-3">{suffix}</div>
      </div>
      <div className="mt-1 text-[10.5px] text-ink-3 mono">{detail}</div>
    </div>
  );
}
