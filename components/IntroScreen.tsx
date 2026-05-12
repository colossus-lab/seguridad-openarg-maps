"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/lib/store";

const LINES = [
  "Observatorio de Inseguridad",
  "República Argentina · 2000 – 2024",
  "Sistema Nacional de Información Criminal",
];

export default function IntroScreen({ progress }: { progress: number }) {
  const { intro, setIntro } = useDashboard();
  const [step, step_] = useState(0);
  const [typed, setTyped] = useState("");
  const [hide, setHide] = useState(false);

  useEffect(() => {
    if (step >= LINES.length) return;
    const target = LINES[step];
    if (typed.length < target.length) {
      const id = setTimeout(() => setTyped(target.slice(0, typed.length + 1)), 28);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => {
      step_(step + 1);
      setTyped("");
    }, 600);
    return () => clearTimeout(id);
  }, [typed, step]);

  // Cuando llegue progress=1 y haya terminado el typing → fade-out.
  useEffect(() => {
    if (intro === "ready" && step >= LINES.length - 1) {
      const id = setTimeout(() => {
        setHide(true);
        setTimeout(() => setIntro("done"), 950);
      }, 800);
      return () => clearTimeout(id);
    }
  }, [intro, step, setIntro]);

  if (intro === "done") return null;

  const skipNow = () => {
    setHide(true);
    setTimeout(() => setIntro("done"), 950);
  };

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center ${hide ? "intro-out" : ""}`}
      style={{
        background:
          "radial-gradient(1200px 700px at 50% 30%, #f7f1e3 0%, transparent 60%), radial-gradient(900px 500px at 80% 80%, #f0e8d7 0%, transparent 55%), linear-gradient(#fbf8f2, #f4eedf)",
      }}
    >
      <div className="paper-grid absolute inset-0 opacity-[0.25]" />
      <div className="relative flex w-full max-w-xl flex-col items-center px-8 text-center">
        {/* Logo institucional grande */}
        <div className="flex items-center gap-3 anim-fade-up">
          <span className="relative inline-flex h-3 w-3">
            <span className="absolute inset-0 rounded-full bg-emerald-500 halo-expand" />
            <span className="absolute inset-0 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[13px] font-semibold uppercase tracking-[0.28em] text-ink">
            Colossus Lab
          </span>
        </div>

        {/* Línea de typing principal */}
        <div className="mt-12 h-[120px] flex flex-col items-center justify-center gap-2">
          {LINES.slice(0, step).map((line, i) => (
            <div
              key={i}
              className={`text-[15px] tracking-tight ${
                i === 0 ? "text-ink font-semibold text-[28px]" : i === 1 ? "text-ink-2 text-[15px]" : "text-ink-3 text-[13px] mono"
              }`}
              style={{ opacity: 0.55 + i * 0.15 }}
            >
              {line}
            </div>
          ))}
          {step < LINES.length && (
            <div
              className={`typing-cursor ${
                step === 0 ? "text-[28px] font-semibold tracking-tight text-ink" : step === 1 ? "text-[15px] text-ink-2" : "mono text-[13px] text-ink-3"
              }`}
            >
              {typed}
            </div>
          )}
        </div>

        {/* Barra de progreso */}
        <div className="mt-10 w-full max-w-sm">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-ink-3">
            <span>Cargando datos SNIC</span>
            <span className="num mono">{Math.round(progress * 100)}%</span>
          </div>
          <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-line-subtle">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-400 transition-[width] duration-500 ease-out"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {/* Skip */}
        <button
          onClick={skipNow}
          className="press-feedback absolute bottom-[-180px] right-[-10px] rounded-md border border-line bg-paper/80 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-2 backdrop-blur transition hover:border-emerald-500/60 hover:text-ink"
        >
          Ir al mapa →
        </button>
      </div>
    </div>
  );
}
