// Procesa departamentos-raw.geojson → public/data/departamentos/{provincia_id}.geojson
// (un archivo por provincia para lazy-load).

import fs from "node:fs";
import path from "node:path";
import * as turf from "@turf/turf";

const IN = path.join(process.cwd(), "scripts", "tmp", "departamentos-raw.geojson");
const OUT_DIR = path.join(process.cwd(), "public", "data", "departamentos");

// 4 decimales = ~11m de precisión. Departamentos requieren más detalle que provincias.
const DEC = 4;
const round = (n) => +n.toFixed(DEC);
function roundCoords(c) {
  if (typeof c[0] === "number") return [round(c[0]), round(c[1])];
  const rounded = c.map(roundCoords);
  if (rounded.length > 0 && typeof rounded[0][0] === "number") {
    const out = [rounded[0]];
    for (let i = 1; i < rounded.length; i++) {
      const a = out[out.length - 1], b = rounded[i];
      if (a[0] !== b[0] || a[1] !== b[1]) out.push(b);
    }
    return out;
  }
  return rounded;
}

function approxCentroid(coords) {
  let sx = 0, sy = 0, n = 0;
  const walk = (c) => {
    if (typeof c[0] === "number") { sx += c[0]; sy += c[1]; n++; return; }
    c.forEach(walk);
  };
  walk(coords);
  return n > 0 ? [round(sx / n), round(sy / n)] : null;
}

function pad2(id) { return String(id).padStart(2, "0"); }
function pad5(id) { return String(id).padStart(5, "0"); }

function main() {
  if (!fs.existsSync(IN)) {
    console.error(`No existe ${IN}. Corré primero: npm run data:fetch-geom`);
    process.exit(1);
  }
  const fc = JSON.parse(fs.readFileSync(IN, "utf8"));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Agrupar por provincia_id.
  const byProv = new Map();
  for (const f of fc.features) {
    // IGN: in1 = id INDEC (5 dígitos), nam = nombre.
    const id = pad5(f.properties.in1 ?? f.properties.id);
    const provId = pad2(id.slice(0, 2));
    const nombre = f.properties.nam ?? f.properties.fna ?? f.properties.nombre;
    // Douglas-Peucker — tolerancia más fina que provincias (~0.003° ≈ 330m).
    const simplified = turf.simplify(
      { type: "Feature", properties: {}, geometry: f.geometry },
      { tolerance: 0.003, highQuality: false, mutate: false },
    );
    const rounded = roundCoords(simplified.geometry.coordinates);
    const centroid = approxCentroid(rounded);
    const feat = {
      type: "Feature",
      properties: { departamento_id: id, provincia_id: provId, nombre, centroid },
      geometry: { type: f.geometry.type, coordinates: rounded },
    };
    let arr = byProv.get(provId);
    if (!arr) { arr = []; byProv.set(provId, arr); }
    arr.push(feat);
  }

  let totalFeats = 0;
  let totalKb = 0;
  byProv.forEach((feats, provId) => {
    const out = { type: "FeatureCollection", features: feats };
    const outPath = path.join(OUT_DIR, `${provId}.geojson`);
    fs.writeFileSync(outPath, JSON.stringify(out));
    const sz = fs.statSync(outPath).size / 1024;
    totalFeats += feats.length;
    totalKb += sz;
    console.log(`  ${provId} → ${feats.length.toString().padStart(4)} deps · ${sz.toFixed(1)} KB`);
  });
  console.log(`✓ ${byProv.size} provincias · ${totalFeats} departamentos · ${totalKb.toFixed(1)} KB total`);
}

main();
