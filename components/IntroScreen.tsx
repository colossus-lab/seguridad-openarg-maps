"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/lib/store";

const LINES = [
  "Observatorio de Inseguridad",
  "República Argentina · 2000 – 2024",
  "Sistema Nacional de Información Criminal",
];

const SS_KEY = "colossus_intro_seen";

export default function IntroScreen({ progress, phase }: { progress: number; phase?: string }) {
  const { intro, setIntro } = useDashboard();

  // En primera visita de la sesión: mostrar intro. Si ya se vió: skip.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(SS_KEY) === "1") {
      setIntro("done");
    }
  }, [setIntro]);
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
        setTimeout(() => {
          if (typeof window !== "undefined") window.sessionStorage.setItem(SS_KEY, "1");
          setIntro("done");
        }, 950);
      }, 600);
      return () => clearTimeout(id);
    }
  }, [intro, step, setIntro]);

  if (intro === "done") return null;

  const skipNow = () => {
    setHide(true);
    setTimeout(() => {
      if (typeof window !== "undefined") window.sessionStorage.setItem(SS_KEY, "1");
      setIntro("done");
    }, 950);
  };

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center ${hide ? "intro-out" : ""}`}
      style={{
        background:
          "radial-gradient(1200px 700px at 50% 30%, rgba(116,172,223,0.12) 0%, transparent 60%), radial-gradient(900px 500px at 80% 80%, rgba(246,180,14,0.06) 0%, transparent 55%), linear-gradient(var(--color-bg), var(--color-surface-1))",
      }}
    >
      <div className="paper-grid absolute inset-0 opacity-[0.25]" />
      <div className="relative flex w-full max-w-xl flex-col items-center px-6 text-center md:px-8">
        {/* Logo institucional */}
        <div className="flex items-center gap-3 anim-fade-up">
          <span className="relative inline-flex h-2.5 w-2.5 md:h-3 md:w-3">
            <span className="absolute inset-0 rounded-full bg-emerald-500 halo-expand" />
            <span className="absolute inset-0 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ink md:text-[13px] md:tracking-[0.28em]">
            Colossus Lab
          </span>
        </div>

        {/* Línea de typing principal */}
        <div className="mt-8 h-[100px] flex flex-col items-center justify-center gap-2 md:mt-12 md:h-[120px]">
          {LINES.slice(0, step).map((line, i) => (
            <div
              key={i}
              className={`tracking-tight ${
                i === 0 ? "text-ink font-semibold text-[22px] md:text-[28px]"
                : i === 1 ? "text-ink-2 text-[13px] md:text-[15px]"
                : "text-ink-3 text-[11.5px] mono md:text-[13px]"
              }`}
              style={{ opacity: 0.55 + i * 0.15 }}
            >
              {line}
            </div>
          ))}
          {step < LINES.length && (
            <div
              className={`typing-cursor ${
                step === 0 ? "text-[22px] font-semibold tracking-tight text-ink md:text-[28px]"
                : step === 1 ? "text-[13px] text-ink-2 md:text-[15px]"
                : "mono text-[11.5px] text-ink-3 md:text-[13px]"
              }`}
            >
              {typed}
            </div>
          )}
        </div>

        {/* Barra de progreso */}
        <div className="mt-8 w-full max-w-sm md:mt-10">
          <div className="flex items-center justify-between text-[9.5px] uppercase tracking-[0.18em] text-ink-3 md:text-[10px]">
            <span className="truncate pr-3">{phase ?? "Cargando datos SNIC"}</span>
            <span className="num mono shrink-0">{Math.round(progress * 100)}%</span>
          </div>
          <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-line-subtle">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-400 transition-[width] duration-200 ease-out"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {/* Skip */}
        <button
          onClick={skipNow}
          className="press-feedback absolute bottom-[-140px] right-2 rounded-md border border-line bg-paper/80 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-2 backdrop-blur transition hover:border-emerald-500/60 hover:text-ink md:bottom-[-180px] md:right-[-10px] md:px-4 md:py-2 md:text-[11px]"
        >
          Ir al mapa →
        </button>
      </div>
    </div>
  );
}
