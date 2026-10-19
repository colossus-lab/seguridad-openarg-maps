import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import type { VRBundle } from "@/lib/types";
import { useVR } from "./store";
import { CINDER, SIN_DATO_COLOR, altura, hexToRgb, intensidad, tasa } from "./datos";

/** Espesor mínimo de cada depto (m), para que los valores bajos sigan leyéndose como relieve. */
const BASE = 0.004;
/** Duración de la transición entre años / delitos (s). */
const TRANSICION = 0.8;

// Un solo mesh (1 draw call) para todos los deptos. Cada vértice trae su depto y si es
// techo o base; la altura y el color salen de una textura de datos de N×1 texels:
//   R = altura (m) · G = intensidad 0–1 (−1 = sin dato) · B = 1 hover / 2 seleccionado · A = visible
const vertexShader = /* glsl */ `
uniform sampler2D uData;
uniform float uBase;
in float aPacked;
out vec3 vWorld;
out vec4 vData;
void main() {
  float dep = floor(aPacked * 0.5 + 0.25);
  float top = aPacked - dep * 2.0;
  vec4 d = texelFetch(uData, ivec2(int(dep), 0), 0);
  vec3 p = position;
  p.y = top * (uBase + d.r) * d.a;
  vData = d;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// Normal plana por derivadas (sin atributo de normales) + una luz direccional fija.
const fragmentShader = /* glsl */ `
uniform vec3 uPal[6];
uniform vec3 uSinDato;
uniform vec3 uHover;
in vec3 vWorld;
in vec4 vData;
out vec4 fragColor;
vec3 rampa(float t) {
  t = clamp(t, 0.0, 1.0) * 5.0;
  float i = min(floor(t), 4.0);
  int k = int(i);
  return mix(uPal[k], uPal[k + 1], t - i);
}
void main() {
  if (vData.a < 0.5) discard;
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(n, cameraPosition - vWorld) < 0.0) n = -n;
  float luz = 0.52 + 0.48 * max(dot(n, normalize(vec3(-0.35, 1.0, 0.45))), 0.0);
  vec3 c = vData.g < 0.0 ? uSinDato : rampa(vData.g);
  if (vData.b > 1.5) c = mix(c, vec3(1.0), 0.45);
  else if (vData.b > 0.5) c = mix(c, uHover, 0.5);
  fragColor = vec4(c * luz, 1.0);
}`;

type Props = { bundle: VRBundle };

export default function MapaMesh({ bundle }: Props) {
  const { meta } = bundle;
  const nDep = meta.departamentos.length;

  const delitoIdx = useVR((s) => s.delitoIdx);
  const anioIdx = useVR((s) => s.anioIdx);
  const provinciaId = useVR((s) => s.provinciaId);

  // --- Geometría de render + copia con alturas reales para el picking (BVH) -------------
  const { geometry, packed, pick } = useMemo(() => {
    const V = meta.vertexCount, I = meta.indexCount;
    const [W, D] = meta.size;
    const pos = new Float32Array(V * 3);
    const packed = new Float32Array(V);
    for (let i = 0; i < V; i++) {
      pos[i * 3] = (bundle.geom[i * 2] / 65535) * W - W / 2;
      pos[i * 3 + 2] = (bundle.geom[i * 2 + 1] / 65535) * D - D / 2;
      packed[i] = bundle.geom[V * 2 + i];
    }
    const index = new THREE.BufferAttribute(bundle.geom.slice(V * 3, V * 3 + I), 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("aPacked", new THREE.BufferAttribute(packed, 1));
    geometry.setIndex(index);

    const pickGeom = new THREE.BufferGeometry();
    pickGeom.setAttribute("position", new THREE.BufferAttribute(pos.slice(), 3));
    pickGeom.setIndex(index);
    const bvh = new MeshBVH(pickGeom);
    (pickGeom as THREE.BufferGeometry & { boundsTree?: MeshBVH }).boundsTree = bvh;
    const pick = new THREE.Mesh(pickGeom, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    pick.raycast = acceleratedRaycast;
    return { geometry, packed, pick: { mesh: pick, bvh } };
  }, [bundle, meta]);

  // --- Textura de datos + estado de la transición --------------------------------------
  const anim = useMemo(() => {
    const data = new Float32Array(nDep * 4);
    const texture = new THREE.DataTexture(data, nDep, 1, THREE.RGBAFormat, THREE.FloatType);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return {
      data,
      texture,
      fromH: new Float32Array(nDep), toH: new Float32Array(nDep), curH: new Float32Array(nDep),
      fromI: new Float32Array(nDep), toI: new Float32Array(nDep),
      vis: new Float32Array(nDep).fill(1),
      t: 1,
      pickDirty: true,
      hover: -1 as number,
      sel: -1 as number,
    };
  }, [nDep]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: {
          uData: { value: anim.texture },
          uBase: { value: BASE },
          // Colores en sRGB crudo: el ShaderMaterial no aplica conversión de salida.
          uPal: { value: CINDER.map((c) => new THREE.Vector3(...hexToRgb(c))) },
          uSinDato: { value: new THREE.Vector3(...hexToRgb(SIN_DATO_COLOR)) },
          uHover: { value: new THREE.Vector3(...hexToRgb("#FFD04A")) },
        },
      }),
    [anim],
  );

  useEffect(() => () => {
    geometry.dispose();
    pick.mesh.geometry.dispose();
    anim.texture.dispose();
    material.dispose();
  }, [geometry, pick, anim, material]);

  // Nuevo objetivo: arranca la transición desde lo que se ve ahora.
  useEffect(() => {
    const del = meta.delitos[delitoIdx];
    const first = anim.t === 1 && anim.curH.every((h) => h === 0);
    for (let dep = 0; dep < nDep; dep++) {
      const v = tasa(bundle, delitoIdx, anioIdx, dep);
      anim.fromH[dep] = anim.curH[dep];
      anim.fromI[dep] = anim.data[dep * 4 + 1];
      anim.toH[dep] = altura(del.p99, v);
      anim.toI[dep] = v == null ? -1 : intensidad(del.quantiles, v);
      anim.vis[dep] = provinciaId == null || meta.departamentos[dep].provincia_id === provinciaId ? 1 : 0;
      if (first) anim.fromI[dep] = anim.toI[dep];
    }
    anim.t = 0;
    anim.pickDirty = true;
  }, [bundle, meta, nDep, delitoIdx, anioIdx, provinciaId, anim]);

  useFrame((_, dt) => {
    const { hover, sel } = (() => {
      const s = useVR.getState();
      return { hover: s.depHover ?? -1, sel: s.depSel ?? -1 };
    })();
    const animando = anim.t < 1;
    if (!animando && hover === anim.hover && sel === anim.sel) {
      if (anim.pickDirty) actualizarPicking();
      return;
    }
    if (animando) anim.t = Math.min(1, anim.t + dt / TRANSICION);
    const t = anim.t;
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
    const d = anim.data;
    for (let dep = 0; dep < nDep; dep++) {
      const h = anim.fromH[dep] + (anim.toH[dep] - anim.fromH[dep]) * e;
      anim.curH[dep] = h;
      const fi = anim.fromI[dep], ti = anim.toI[dep];
      d[dep * 4] = h;
      d[dep * 4 + 1] = fi < 0 || ti < 0 ? (e < 0.5 ? fi : ti) : fi + (ti - fi) * e;
      d[dep * 4 + 2] = dep === sel ? 2 : dep === hover ? 1 : 0;
      d[dep * 4 + 3] = anim.vis[dep];
    }
    anim.hover = hover;
    anim.sel = sel;
    anim.texture.needsUpdate = true;
  });

  // Lleva las alturas finales a la geometría de picking y reajusta el BVH (solo al
  // terminar una transición, no cuadro a cuadro).
  function actualizarPicking() {
    const attr = pick.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < packed.length; i++) {
      const p = packed[i];
      const dep = p >> 1;
      arr[i * 3 + 1] = p & 1 ? (BASE + anim.toH[dep]) * anim.vis[dep] : 0;
    }
    attr.needsUpdate = true;
    pick.bvh.refit();
    anim.pickDirty = false;
  }

  // Raycast contra la copia con BVH; devuelve el impacto más cercano en un depto visible.
  const raycast = useMemo(
    () =>
      function (this: THREE.Mesh, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
        pick.mesh.matrixWorld.copy(this.matrixWorld);
        const hits: THREE.Intersection[] = [];
        pick.mesh.raycast(raycaster, hits);
        let best: THREE.Intersection | null = null;
        for (const h of hits) {
          if (!h.face) continue;
          const dep = packed[h.face.a] >> 1;
          if (anim.vis[dep] < 0.5) continue;
          if (!best || h.distance < best.distance) best = h;
        }
        if (best) intersects.push({ ...best, object: this });
      },
    [pick, packed, anim],
  );

  const depDe = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.face ? packed[e.face.a] >> 1 : null);

  return (
    <mesh
      geometry={geometry}
      material={material}
      raycast={raycast}
      frustumCulled={false}
      onPointerMove={(e) => {
        e.stopPropagation();
        const dep = depDe(e);
        if (dep !== useVR.getState().depHover) useVR.getState().setDepHover(dep);
      }}
      onPointerLeave={() => useVR.getState().setDepHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        const dep = depDe(e);
        const { depSel, setDepSel } = useVR.getState();
        setDepSel(dep === depSel ? null : dep);
      }}
    />
  );
}
