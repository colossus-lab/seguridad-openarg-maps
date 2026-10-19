import { useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Handle } from "@react-three/handle";
import { useXR, useXRHitTest, useXRInputSourceEvent, useXRInputSourceState } from "@react-three/xr";
import * as THREE from "three";
import type { VRBundle } from "@/lib/types";
import { useVR } from "./store";
import MapaMesh from "./MapaMesh";
import Paneles from "./Paneles";

/** Altura de mesa (m) y distancia del centro de la maqueta al usuario al entrar. */
export const MESA_Y = 0.74;
export const MESA_Z = -0.95;
const PLACA_ALTO = 0.012;
/** Espacio que ocupa una provincia ampliada (m). */
const ZOOM_ANCHO = 0.6;
const ZOOM_LARGO = 1.2;

export default function Maqueta({ bundle }: { bundle: VRBundle }) {
  const ubicacion = useRef<THREE.Group>(null);
  const mode = useXR((s) => s.mode);
  const enXR = mode === "immersive-ar" || mode === "immersive-vr";
  const [W, D] = bundle.meta.size;

  return (
    <>
      <group ref={ubicacion} position={[0, MESA_Y, MESA_Z]}>
        {enXR ? (
          // Agarrar la placa (gatillo lateral / pellizco cerca) mueve la maqueta.
          <Handle targetRef={ubicacion} rotate={false} scale={false}>
            <Placa W={W} D={D} />
          </Handle>
        ) : (
          <Placa W={W} D={D} />
        )}
        {enXR && <Rotador targetRef={ubicacion} x={W / 2 + 0.05} z={-D / 2 - 0.05} />}
        {mode !== "immersive-ar" && <Mesa W={W} D={D} />}
        <Zoom bundle={bundle}>
          <MapaMesh bundle={bundle} />
        </Zoom>
        <Paneles bundle={bundle} />
      </group>
      {mode === "immersive-ar" && <UbicarEnMesa ubicacion={ubicacion} />}
    </>
  );
}

function Placa({ W, D }: { W: number; D: number }) {
  return (
    <mesh position={[0, -PLACA_ALTO / 2 - 0.0005, 0]}>
      <boxGeometry args={[W + 0.06, PLACA_ALTO, D + 0.06]} />
      <meshLambertMaterial color="#0F1620" />
    </mesh>
  );
}

/** Perilla en la esquina: arrastrarla gira la maqueta sobre el eje vertical. */
function Rotador({ targetRef, x, z }: { targetRef: RefObject<THREE.Group | null>; x: number; z: number }) {
  return (
    <Handle targetRef={targetRef} translate="as-rotate" rotate="y" scale={false}>
      <group position={[x, 0.01, z]}>
        <mesh>
          <torusGeometry args={[0.035, 0.009, 12, 32]} />
          <meshLambertMaterial color="#FFD04A" />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.014, 16, 12]} />
          <meshLambertMaterial color="#FFD04A" />
        </mesh>
      </group>
    </Handle>
  );
}

/** Mesa virtual (solo VR y escritorio; en AR la maqueta va sobre la mesa real). */
function Mesa({ W, D }: { W: number; D: number }) {
  return (
    <group>
      <mesh position={[0, -PLACA_ALTO - 0.02, 0.1]}>
        <boxGeometry args={[W + 0.75, 0.04, D + 0.5]} />
        <meshLambertMaterial color="#141C2A" />
      </mesh>
      <mesh position={[0, -MESA_Y / 2 - 0.02, 0.1]}>
        <cylinderGeometry args={[0.07, 0.11, MESA_Y - 0.04, 24]} />
        <meshLambertMaterial color="#101724" />
      </mesh>
    </group>
  );
}

/**
 * Modo provincia: escala el mapa solo en x/z (las alturas siguen en metros) para que la
 * provincia ocupe el lugar del país, con una transición amortiguada.
 */
function Zoom({ bundle, children }: { bundle: VRBundle; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const provinciaId = useVR((s) => s.provinciaId);
  const objetivo = useMemo(() => {
    const p = bundle.meta.provincias.find((x) => x.id === provinciaId);
    if (!p) return { s: 1, x: 0, z: 0 };
    const [x0, z0, x1, z1] = p.bbox;
    const s = Math.min(ZOOM_ANCHO / (x1 - x0), ZOOM_LARGO / (z1 - z0), 80);
    return { s, x: (-(x0 + x1) / 2) * s, z: (-(z0 + z1) / 2) * s };
  }, [bundle, provinciaId]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const k = 1 - Math.exp(-dt * 6);
    // Interpolación en escala logarítmica: el zoom se siente parejo aunque sea ×50.
    const s = Math.exp(Math.log(g.scale.x) + (Math.log(objetivo.s) - Math.log(g.scale.x)) * k);
    g.scale.set(s, 1, s);
    g.position.x += (objetivo.x - g.position.x) * k;
    g.position.z += (objetivo.z - g.position.z) * k;
  });

  return <group ref={ref}>{children}</group>;
}

/** AR: apuntar a una superficie real y apretar el gatillo (o pellizcar) para apoyar la maqueta. */
function UbicarEnMesa({ ubicacion }: { ubicacion: RefObject<THREE.Group | null> }) {
  const placing = useVR((s) => s.placing);
  const control = useXRInputSourceState("controller", "right");
  const mano = useXRInputSourceState("hand", "right");
  const space = control?.inputSource.targetRaySpace ?? mano?.inputSource.targetRaySpace;
  if (!placing || !space) return null;
  return <HitTest space={space} ubicacion={ubicacion} />;
}

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _cam = new THREE.Vector3();

function HitTest({ space, ubicacion }: { space: XRSpace; ubicacion: RefObject<THREE.Group | null> }) {
  const reticula = useRef<THREE.Mesh>(null);
  const punto = useRef<THREE.Vector3 | null>(null);
  const desde = useRef(performance.now());
  const camera = useThree((s) => s.camera);

  useXRHitTest(
    (results, getWorldMatrix) => {
      const r = reticula.current;
      if (!r) return;
      if (results.length === 0 || !getWorldMatrix(_m, results[0])) {
        r.visible = false;
        punto.current = null;
        return;
      }
      _v.setFromMatrixPosition(_m);
      r.position.copy(_v);
      r.visible = true;
      punto.current = (punto.current ?? new THREE.Vector3()).copy(_v);
    },
    space,
    "plane",
  );

  useXRInputSourceEvent(
    "all",
    "select",
    () => {
      // Ignora el mismo gatillo que apretó "Ubicar en mesa".
      if (performance.now() - desde.current < 400) return;
      const g = ubicacion.current;
      if (!g || !punto.current) return;
      g.position.copy(punto.current).add(new THREE.Vector3(0, PLACA_ALTO, 0));
      camera.getWorldPosition(_cam);
      // El borde sur (+z, donde están los controles) mira al usuario.
      g.rotation.set(0, Math.atan2(_cam.x - g.position.x, _cam.z - g.position.z), 0);
      useVR.getState().setPlacing(false);
    },
    [ubicacion, camera],
  );

  return (
    <mesh ref={reticula} rotation-x={-Math.PI / 2} visible={false}>
      <ringGeometry args={[0.05, 0.07, 40]} />
      <meshBasicMaterial color="#FFD04A" side={THREE.DoubleSide} />
    </mesh>
  );
}
