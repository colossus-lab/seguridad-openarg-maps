"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { IfInSessionMode, PointerEvents, XR, createXRStore, noEvents, useXR } from "@react-three/xr";
import { useStore } from "zustand";
import { loadVRBundle } from "@/lib/data";
import type { VRBundle } from "@/lib/types";
import { useVR } from "./store";
import Maqueta, { MESA_Y, MESA_Z } from "./Maqueta";
import Cargando from "./Cargando";
import { emularQuestEnLocalhost } from "./emulador";

// El emulador de localhost lo inyecta ./emulador (el de @react-three/xr no funciona con iwer 2.6).
const xrStore = createXRStore({
  emulate: false,
  foveation: 1,
  frameRate: "high",
  controller: { teleportPointer: false },
  hand: { teleportPointer: false },
  hitTest: true,
});

const PASO_PLAY_MS = 1100;

export default function Experience() {
  const [bundle, setBundle] = useState<VRBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadVRBundle()
      .then((b) => {
        useVR.setState({ anioIdx: b.meta.anios.length - 1 });
        setBundle(b);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <Cargando texto={`No se pudieron cargar los datos (${error}).`} />;
  if (!bundle) return <Cargando texto="Cargando departamentos…" />;

  return (
    <div className="fixed inset-0 bg-[#06090F]">
      <Canvas
        events={noEvents}
        camera={{ position: [0, 1.62, 0.62], fov: 50, near: 0.02, far: 40 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        style={{ touchAction: "none" }}
      >
        {/* Sin batching: cada evento se resuelve contra la intersección actual (clicks rápidos
            o cuadros lentos no caen sobre el objeto del cuadro anterior). */}
        <PointerEvents batchEvents={false} />
        <XR store={xrStore}>
          <Escena bundle={bundle} />
        </XR>
      </Canvas>
      <Overlay />
      <Reproductor nAnios={bundle.meta.anios.length} />
    </div>
  );
}

function Escena({ bundle }: { bundle: VRBundle }) {
  const mode = useXR((s) => s.mode);
  return (
    <>
      {mode !== "immersive-ar" && <color attach="background" args={["#06090F"]} />}
      <ambientLight intensity={1.4} />
      <directionalLight position={[-1, 3, 2]} intensity={1.6} />
      <IfInSessionMode deny={["immersive-ar", "immersive-vr"]}>
        <OrbitControls
          makeDefault
          target={[0, MESA_Y, MESA_Z]}
          enableDamping
          minDistance={0.35}
          maxDistance={3.2}
          maxPolarAngle={Math.PI * 0.47}
        />
      </IfInSessionMode>
      {mode !== "immersive-ar" && <Piso />}
      <Suspense fallback={null}>
        <Maqueta bundle={bundle} />
      </Suspense>
    </>
  );
}

function Piso() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[7, 64]} />
        <meshBasicMaterial color="#0A0F18" />
      </mesh>
      <gridHelper args={[14, 56, "#1A2638", "#111927"]} position-y={0.002} />
    </group>
  );
}

/** Avanza un año cada PASO_PLAY_MS mientras está en play; se detiene en el último. */
function Reproductor({ nAnios }: { nAnios: number }) {
  const playing = useVR((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const { anioIdx, setAnio, setPlaying } = useVR.getState();
      if (anioIdx >= nAnios - 1) setPlaying(false);
      else setAnio(anioIdx + 1);
    }, PASO_PLAY_MS);
    return () => clearInterval(id);
  }, [playing, nAnios]);
  return null;
}

/** Botones HTML para entrar en la sesión inmersiva (se ocultan dentro del visor). */
function Overlay() {
  const session = useStore(xrStore, (s) => s.session);
  const [soporte, setSoporte] = useState<{ ar: boolean; vr: boolean } | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      await emularQuestEnLocalhost();
      const xr = typeof navigator !== "undefined" ? navigator.xr : undefined;
      const [ar, vr] = xr
        ? await Promise.all([
            xr.isSessionSupported("immersive-ar").catch(() => false),
            xr.isSessionSupported("immersive-vr").catch(() => false),
          ])
        : [false, false];
      if (vivo) setSoporte({ ar, vr });
    })();
    return () => { vivo = false; };
  }, []);

  if (session) return null;
  const ninguno = soporte != null && !soporte.ar && !soporte.vr;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 flex justify-between gap-4 p-4">
      <div className="pointer-events-auto max-w-sm rounded-xl border border-white/10 bg-[#06090F]/85 p-4 backdrop-blur">
        <div className="eyebrow text-[#74ACDF]">Colossus Lab · Maqueta 3D</div>
        <h1 className="mt-1 text-lg font-semibold text-white">Mapa de inseguridad · Argentina</h1>
        <p className="mt-1 text-[13px] leading-snug text-white/65">
          Altura y color: tasa de delitos por 100.000 habitantes (SNIC, 2000–2024). Arrastrá para girar, rueda
          para acercar, clic en un departamento para ver el detalle.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!soporte?.ar}
            onClick={() => xrStore.enterAR()}
            className="rounded-lg bg-[#FFD04A] px-3 py-2 text-sm font-semibold text-[#06090F] disabled:opacity-40"
          >
            Entrar en AR (passthrough)
          </button>
          <button
            type="button"
            disabled={!soporte?.vr}
            onClick={() => xrStore.enterVR()}
            className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Entrar en VR
          </button>
        </div>
        {ninguno && (
          <p className="mt-2 text-[12px] text-white/50">
            Este navegador no soporta WebXR. Abrí esta página desde el navegador del Meta Quest.
          </p>
        )}
      </div>
      <Link
        href="/"
        className="pointer-events-auto h-fit rounded-full border border-white/15 bg-[#06090F]/85 px-3 py-1.5 text-[12px] text-white/80 hover:text-white"
      >
        ← Mapa 2D
      </Link>
    </div>
  );
}

