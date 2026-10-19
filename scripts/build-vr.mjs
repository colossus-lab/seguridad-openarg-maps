// ETL de la experiencia /vr: maqueta 3D de los departamentos sobre una mesa.
//
// Input:  scripts/tmp/departamentos-raw.geojson (IGN, npm run data:fetch-geom)
//         public/data/pais.json (npm run data:build)
// Output: public/data/vr/meta.json            índice: deptos, provincias, delitos, escalas
//         public/data/vr/geom-<hash>.bin      malla triangulada (techos + paredes), Uint16
//         public/data/vr/values-<hash>.bin    tasa por [delito][año][depto], Uint16 cuantizado
//
// La malla se simplifica con mapshaper (preserva topología: no quedan huecos entre deptos),
// se proyecta a metros de maqueta y se triangula acá con earcut, así el visor no triangula.
// Los .bin llevan hash en el nombre porque vercel.json sirve /data/* como immutable.
//
// Uso: node --max-old-space-size=8192 scripts/build-vr.mjs

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import mapshaper from "mapshaper";
import earcut from "earcut";
import { IGN_TO_SNIC } from "./lib/ids.mjs";

const RAW = path.join(process.cwd(), "scripts", "tmp", "departamentos-raw.geojson");
const DATASET = path.join(process.cwd(), "public", "data", "pais.json");
const OUT_DIR = path.join(process.cwd(), "public", "data", "vr");

// Recorte: deja afuera la Antártida y las Georgias/Sandwich del Sur (mantiene Malvinas).
const CLIP_BBOX = [-74, -56, -53, -21];
// Simplificación en metros reales. A escala de mesa 1 mm ≈ 2,8 km.
const SIMPLIFY_INTERVAL_M = 1000;
// Largo norte–sur de la maqueta, en metros.
const MAQUETA_LARGO = 1.3;
const LAT_REF = -38; // corrección cos(lat) de la equirectangular

// Delitos del selector. "total" = suma de tasas SNIC (mismo denominador poblacional).
const DELITOS_VR = [
  { id: "total", nombre: "Total de delitos" },
  { id: "1", nombre: "Homicidios dolosos" },
  { id: "15", nombre: "Robos" },
  { id: "17", nombre: "Robos agravados" },
  { id: "19", nombre: "Hurtos" },
  { id: "5", nombre: "Lesiones dolosas" },
  { id: "10", nombre: "Abusos sexuales con acceso carnal" },
  { id: "13", nombre: "Amenazas" },
  { id: "28", nombre: "Estupefacientes" },
];
const NOMBRE_CORTO_PROV = {
  "02": "CABA",
  "94": "Tierra del Fuego",
};
const SIN_DATO = 0xffff;
const N_QUANTILES = 32;

const fmtKB = (b) => `${(b / 1024).toFixed(1)} KB`;
const fmtMB = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

function polygonsOf(geom) {
  if (!geom) return [];
  return geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
}

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

async function main() {
  for (const f of [RAW, DATASET]) {
    if (!fs.existsSync(f)) {
      console.error(`No existe ${f}. Corré antes npm run data:fetch-geom / npm run data:build`);
      process.exit(1);
    }
  }

  // --- 1. Simplificación + recorte -------------------------------------------------------
  const rawText = fs.readFileSync(RAW, "utf8");
  let rawVerts = 0;
  for (const f of JSON.parse(rawText).features)
    for (const poly of polygonsOf(f.geometry)) for (const ring of poly) rawVerts += ring.length;

  const out = await mapshaper.applyCommands(
    `-i in.json -clip bbox=${CLIP_BBOX.join(",")} -filter-slivers ` +
      `-simplify interval=${SIMPLIFY_INTERVAL_M} keep-shapes -o out.json format=geojson precision=0.0001`,
    { "in.json": rawText },
  );
  const fc = JSON.parse(out["out.json"]);

  // --- 2. Cruce con el dataset -----------------------------------------------------------
  const ds = JSON.parse(fs.readFileSync(DATASET, "utf8"));
  const dsDepIdx = new Map(ds.departamentos.map((d, i) => [d.id, i]));
  const provNombre = new Map(ds.provincias.map((p) => [p.id, NOMBRE_CORTO_PROV[p.id] ?? p.nombre]));

  const feats = fc.features
    .filter((f) => f.geometry && polygonsOf(f.geometry).length > 0)
    .map((f) => {
      const ignId = String(f.properties.in1).padStart(5, "0");
      const id = IGN_TO_SNIC[ignId] ?? ignId;
      return { id, provincia_id: id.slice(0, 2), nombre: f.properties.nam, geometry: f.geometry };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  // --- 3. Proyección a metros de maqueta (x = este, z = sur; el norte queda lejos) ------
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const f of feats)
    for (const poly of polygonsOf(f.geometry))
      for (const [lon, lat] of poly[0]) {
        minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      }
  const K = MAQUETA_LARGO / (maxLat - minLat); // metros por grado de latitud
  const cosRef = Math.cos((LAT_REF * Math.PI) / 180);
  const lonC = (minLon + maxLon) / 2, latC = (minLat + maxLat) / 2;
  const project = ([lon, lat]) => [(lon - lonC) * cosRef * K, -(lat - latC) * K];
  const halfX = ((maxLon - minLon) / 2) * cosRef * K;
  const halfZ = MAQUETA_LARGO / 2;

  // --- 4. Triangulación: techos (earcut) + paredes ---------------------------------------
  // Cada vértice de anillo genera dos vértices: techo (top=1) y base (top=0).
  // La altura la pone el shader según el depto, así que acá todo es 2D.
  const xs = [], zs = [], packed = [], indices = [];
  const depBox = feats.map(() => [Infinity, Infinity, -Infinity, -Infinity]);
  const depArea = new Float64Array(feats.length);
  const depCx = new Float64Array(feats.length), depCz = new Float64Array(feats.length);

  const addVertex = (x, z, dep, top) => {
    xs.push(x); zs.push(z); packed.push(dep * 2 + top);
    return xs.length - 1;
  };
  // Emite un triángulo con la cara hacia `n` (vector deseado), corrigiendo el winding.
  const pushTri = (a, b, c, pos, n) => {
    const [ax, ay, az] = pos(a), [bx, by, bz] = pos(b), [cx, cy, cz] = pos(c);
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * n[0] + ny * n[1] + nz * n[2] >= 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  };
  const pos3 = (i) => [xs[i], packed[i] & 1, zs[i]]; // y simbólica: base 0, techo 1

  feats.forEach((f, dep) => {
    for (const poly of polygonsOf(f.geometry)) {
      const rings = poly.map((ring) => {
        const pts = ring.map(project);
        if (pts.length > 1) {
          const [x0, z0] = pts[0], [xn, zn] = pts[pts.length - 1];
          if (x0 === xn && z0 === zn) pts.pop(); // GeoJSON cierra el anillo
        }
        return pts;
      });
      if (rings[0].length < 3) continue;

      // Techo.
      const flat = [], holes = [], topIdx = [];
      rings.forEach((pts, ri) => {
        if (ri > 0) holes.push(flat.length / 2);
        for (const [x, z] of pts) {
          flat.push(x, z);
          topIdx.push(addVertex(x, z, dep, 1));
        }
      });
      const tris = earcut(flat, holes, 2);
      for (let t = 0; t < tris.length; t += 3)
        pushTri(topIdx[tris[t]], topIdx[tris[t + 1]], topIdx[tris[t + 2]], pos3, [0, 1, 0]);

      // Paredes: normal hacia afuera del polígono (interior a la izquierda o derecha
      // según el sentido del anillo; para los agujeros se invierte sola).
      let off = 0;
      rings.forEach((pts, ri) => {
        let area2 = 0;
        for (let i = 0; i < pts.length; i++) {
          const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
          area2 += x1 * z2 - x2 * z1;
        }
        const ccw = area2 > 0;
        const outward = ri === 0 ? ccw : !ccw;
        const baseIdx = pts.map(([x, z]) => addVertex(x, z, dep, 0));
        for (let i = 0; i < pts.length; i++) {
          const j = (i + 1) % pts.length;
          const [x1, z1] = pts[i], [x2, z2] = pts[j];
          const dx = x2 - x1, dz = z2 - z1;
          // Para un anillo con área positiva en (x,z), (dz, -dx) apunta hacia afuera.
          const n = outward ? [dz, 0, -dx] : [-dz, 0, dx];
          const t1 = topIdx[off + i], t2 = topIdx[off + j], b1 = baseIdx[i], b2 = baseIdx[j];
          pushTri(b1, b2, t2, pos3, n);
          pushTri(b1, t2, t1, pos3, n);
        }
        off += pts.length;
        if (ri === 0) {
          const a = Math.abs(area2) / 2;
          let cx = 0, cz = 0;
          for (const [x, z] of pts) {
            cx += x; cz += z;
            const b = depBox[dep];
            b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], z); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], z);
          }
          // Centroide del anillo exterior más grande (para paneles / etiquetas).
          if (a > depArea[dep]) {
            depArea[dep] = a; depCx[dep] = cx / pts.length; depCz[dep] = cz / pts.length;
          }
        }
      });
    }
  });

  const vertexCount = xs.length;
  if (vertexCount > 0xffff) throw new Error(`${vertexCount} vértices: no entran en índices Uint16, subí SIMPLIFY_INTERVAL_M`);

  // Cuantización de posiciones a Uint16 sobre el bbox de la maqueta.
  const qx = (x) => Math.round(((x + halfX) / (2 * halfX)) * 65535);
  const qz = (z) => Math.round(((z + halfZ) / (2 * halfZ)) * 65535);
  const geom = new Uint16Array(vertexCount * 3 + indices.length);
  for (let i = 0; i < vertexCount; i++) {
    geom[i * 2] = qx(xs[i]);
    geom[i * 2 + 1] = qz(zs[i]);
    geom[vertexCount * 2 + i] = packed[i];
  }
  geom.set(indices, vertexCount * 3);

  // --- 5. Valores: tasa por [delito][año][depto] ----------------------------------------
  const nDep = feats.length, nA = ds.anios.length;
  const snicIdx = ds.delitos.map((d, i) => (d.fuente === "snic" ? i : -1)).filter((i) => i >= 0);
  const tasaDe = (dsi, delitoId, ai) => {
    const row = ds.dep_tasa[dsi];
    if (delitoId === "total") return snicIdx.reduce((s, di) => s + row[di][ai], 0);
    return row[ds.delitos.findIndex((d) => d.id === delitoId)][ai];
  };
  // Un depto sin ningún hecho SNIC en el año no reportó (p. ej. La Pampa antes de 2022).
  const reporto = (dsi, ai) => snicIdx.some((di) => ds.dep_hechos[dsi][di][ai] > 0);

  const values = new Uint16Array(DELITOS_VR.length * nA * nDep);
  const delitosMeta = DELITOS_VR.map((del, k) => {
    const raw = new Float64Array(nA * nDep).fill(NaN);
    feats.forEach((f, dep) => {
      const dsi = dsDepIdx.get(f.id);
      if (dsi == null) return;
      for (let ai = 0; ai < nA; ai++) if (reporto(dsi, ai)) raw[ai * nDep + dep] = tasaDe(dsi, del.id, ai);
    });
    const positivos = [...raw].filter((v) => v > 0).sort((a, b) => a - b);
    const max = positivos[positivos.length - 1] ?? 1;
    raw.forEach((v, i) => {
      values[k * nA * nDep + i] = Number.isNaN(v) ? SIN_DATO : Math.round((v / max) * 65534);
    });
    return {
      ...del,
      max: +max.toFixed(3),
      // Referencia de altura: p99, para que un outlier no aplaste al resto.
      p99: +quantile(positivos, 0.99).toFixed(3),
      // Cortes de percentil (sobre todos los años) para la escala de color.
      quantiles: Array.from({ length: N_QUANTILES + 1 }, (_, i) => +quantile(positivos, i / N_QUANTILES).toFixed(3)),
    };
  });

  // --- 6. Escritura --------------------------------------------------------------------
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(OUT_DIR)) if (/^(geom|values)-[0-9a-f]+\.bin$/.test(f)) fs.rmSync(path.join(OUT_DIR, f));
  const write = (prefix, arr) => {
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    const name = `${prefix}-${crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10)}.bin`;
    fs.writeFileSync(path.join(OUT_DIR, name), buf);
    return { name, bytes: buf.length };
  };
  const geomFile = write("geom", geom);
  const valuesFile = write("values", values);

  const provBox = new Map();
  feats.forEach((f, dep) => {
    const b = depBox[dep];
    const p = provBox.get(f.provincia_id) ?? [Infinity, Infinity, -Infinity, -Infinity];
    provBox.set(f.provincia_id, [Math.min(p[0], b[0]), Math.min(p[1], b[1]), Math.max(p[2], b[2]), Math.max(p[3], b[3])]);
  });
  const r4 = (n) => +n.toFixed(4);

  const meta = {
    generado: new Date().toISOString(),
    fuente: "SNIC — Ministerio de Seguridad de la Nación",
    unidad: "tasa por 100.000 habitantes",
    files: { geom: geomFile.name, values: valuesFile.name },
    size: [r4(2 * halfX), r4(2 * halfZ)],
    vertexCount,
    indexCount: indices.length,
    sinDato: SIN_DATO,
    anios: ds.anios,
    delitos: delitosMeta,
    provincias: ds.provincias
      .filter((p) => provBox.has(p.id))
      .map((p) => ({ id: p.id, nombre: provNombre.get(p.id), bbox: provBox.get(p.id).map(r4) })),
    departamentos: feats.map((f, dep) => ({
      id: f.id,
      nombre: f.nombre,
      provincia_id: f.provincia_id,
      c: [r4(depCx[dep]), r4(depCz[dep])],
    })),
  };
  const metaPath = path.join(OUT_DIR, "meta.json");
  fs.writeFileSync(metaPath, JSON.stringify(meta));

  const sinDatos = feats.filter((f) => !dsDepIdx.has(f.id)).map((f) => `${f.id} ${f.nombre}`);
  console.log(`✓ maqueta ${meta.size[0]} × ${meta.size[1]} m · ${nDep} deptos · ${vertexCount} vértices · ${indices.length / 3} triángulos`);
  console.log(`  geometría: IGN crudo ${fmtMB(rawText.length)} (${rawVerts} vértices) → departamentos.geojson del sitio ${fmtKB(fs.statSync(path.join(process.cwd(), "public", "data", "departamentos.geojson")).size)} → VR ${fmtKB(geomFile.bytes)}`);
  console.log(`  valores: pais.json ${fmtKB(fs.statSync(DATASET).size)} → VR ${fmtKB(valuesFile.bytes)} (${DELITOS_VR.length} delitos × ${nA} años) · meta ${fmtKB(fs.statSync(metaPath).size)}`);
  if (sinDatos.length) console.log(`  sin datos SNIC: ${sinDatos.join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
