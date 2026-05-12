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
      <div className="flex min-h-screen items-center justify-center bg-paper text-ink-3">
        <span className="eyebrow">Cargando datos SNIC…</span>
      </div>
    );
  }

  const rango = `${dataset.anios[0]}–${dataset.anios[dataset.anios.length - 1]}`;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line-subtle bg-paper/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink">
              Colossus Lab
            </span>
            <span className="h-3 w-px bg-line" />
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-3">
              Observatorio · Seguridad · República Argentina
            </span>
          </div>
          <nav className="flex items-center gap-5 text-[12px] text-ink-2">
            <a href="https://www.colossuslab.org" target="_blank" rel="noreferrer" className="hover:text-ink">colossuslab.org</a>
            <a
              href="https://www.argentina.gob.ar/seguridad/estadisticascriminales"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink"
            >
              Fuente SNIC
            </a>
          </nav>
        </div>
      </header>

      <section className="border-b border-line-subtle">
        <div className="mx-auto max-w-[1240px] px-6 py-7 md:py-10">
          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_300px] md:items-end">
            <div>
              <div className="eyebrow mb-2">Open Arg · Panel Nacional</div>
              <h1 className="text-[26px] font-semibold leading-[1.05] tracking-tight md:text-[36px]">
                Mapa de inseguridad
                <span className="block text-ink-3">República Argentina</span>
              </h1>
              <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-2">
                Visualización 3D del SNIC para las 24 provincias y los {dataset.departamentos.length} departamentos
                del país. Al hacer click en una provincia se carga un hexgrid fino que detalla
                la métrica a nivel departamental. Datos oficiales del Ministerio de Seguridad de la Nación.
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-4 border-l border-line-subtle pl-6 md:grid-cols-1 md:gap-2.5">
              <Meta label="Cobertura" value={`${dataset.provincias.length} provincias`} />
              <Meta label="Serie temporal" value={rango} />
              <Meta label="Delitos cubiertos" value={`${dataset.delitos.length} categorías`} />
            </dl>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1240px] px-6 py-8">
        <Vista3DPais />
      </main>

      <footer className="mt-10 border-t border-line-subtle">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-6 py-6 text-[12px] text-ink-3">
          <div>
            Elaborado por <span className="font-semibold text-ink">Colossus Lab</span> · Datos oficiales
            del Ministerio de Seguridad de la Nación (SNIC + SAT).
          </div>
          <div className="mono">
            {new Date(dataset.meta.generado).toISOString().slice(0, 10)}
          </div>
        </div>
      </footer>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 text-[15px] font-semibold text-ink num">{value}</div>
    </div>
  );
}
