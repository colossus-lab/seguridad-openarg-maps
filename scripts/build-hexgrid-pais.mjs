// Hexgrid país grueso (~25 km por arista) sobre Argentina continental.
// Cada celda guarda provincia_id y departamento_id (por punto-en-polígono del centroide).
// Output: public/data/hexgrid-pais.geojson

import fs from "node:fs";
import path from "node:path";
import * as turf from "@turf/turf";

const IN_PROV = path.join(process.cwd(), "public", "data", "pais.geojson");
const IN_DEP_DIR = path.join(process.cwd(), "public", "data", "departamentos");
const OUT = path.join(process.cwd(), "public", "data", "hexgrid-pais.geojson");

const CELL_KM = Number(process.env.HEX_KM ?? 15);
const DEC = 4;

// Bbox de Argentina continental (sin Antártida).
const BBOX = [-73.6, -55.2, -53.5, -21.7];

const round = (n) => +n.toFixed(DEC);
const roundCoords = (c) => typeof c[0] === "number" ? [round(c[0]), round(c[1])] : c.map(roundCoords);

function main() {
  if (!fs.existsSync(IN_PROV)) {
    console.error(`No existe ${IN_PROV}. Corré primero build-geojson-pais.mjs`);
    process.exit(1);
  }
  const provFc = JSON.parse(fs.readFileSync(IN_PROV, "utf8"));

  // Cargar todos los departamentos en un solo array.
  const depFeats = [];
  for (const f of fs.readdirSync(IN_DEP_DIR)) {
    if (!f.endsWith(".geojson")) continue;
    const fc = JSON.parse(fs.readFileSync(path.join(IN_DEP_DIR, f), "utf8"));
    depFeats.push(...fc.features);
  }
  console.log(`  provincias=${provFc.features.length} departamentos=${depFeats.length}`);

  const cells = turf.hexGrid(BBOX, CELL_KM, { units: "kilometers" });
  console.log(`  bbox cells generadas=${cells.features.length}`);

  const out = [];
  const perProv = new Map();
  cells.features.forEach((cell, i) => {
    const centroid = turf.centroid(cell);
    const prov = provFc.features.find((p) => turf.booleanPointInPolygon(centroid, p));
    if (!prov) return; // fuera de Argentina continental
    const provId = prov.properties.provincia_id;
    // Buscar departamento dentro de los de esa provincia para acelerar.
    const candidatos = depFeats.filter((d) => d.properties.provincia_id === provId);
    let depId = null;
    for (const d of candidatos) {
      if (turf.booleanPointInPolygon(centroid, d)) { depId = d.properties.departamento_id; break; }
    }
    cell.properties = { provincia_id: provId, departamento_id: depId };
    cell.geometry.coordinates = roundCoords(cell.geometry.coordinates);
    cell.id = out.length;
    out.push(cell);
    perProv.set(provId, (perProv.get(provId) ?? 0) + 1);
    if (i % 500 === 0) process.stdout.write(`\r  procesadas=${i}/${cells.features.length}`);
  });
  process.stdout.write("\n");

  // Precomputar 6 vecinos por celda (por distancia entre centroides) para smoothing en cliente.
  console.log("  computando vecinos…");
  const centroids = out.map((c) => turf.centroid(c).geometry.coordinates);
  const CELL_DEG = CELL_KM / 111; // grados ~ km
  for (let i = 0; i < out.length; i++) {
    const [lon, lat] = centroids[i];
    // Búsqueda local: candidatos cuyo centroide cae dentro de 2.5 × cell
    const dlat = CELL_DEG * 2.5;
    const dlon = CELL_DEG * 2.5 / Math.cos((lat * Math.PI) / 180);
    const cand = [];
    for (let j = 0; j < out.length; j++) {
      if (i === j) continue;
      const [lo, la] = centroids[j];
      if (Math.abs(la - lat) > dlat) continue;
      if (Math.abs(lo - lon) > dlon) continue;
      const dx = lo - lon, dy = la - lat;
      cand.push({ j, d: dx * dx + dy * dy });
    }
    cand.sort((a, b) => a.d - b.d);
    out[i].properties.n = cand.slice(0, 6).map((x) => x.j);
  }

  const fc = { type: "FeatureCollection", features: out };
  fs.writeFileSync(OUT, JSON.stringify(fc));
  const sizeKb = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`✓ ${OUT} — ${out.length} celdas de ~${CELL_KM} km · ${sizeKb} KB`);
  perProv.forEach((count, pid) => {
    const p = provFc.features.find((x) => x.properties.provincia_id === pid);
    console.log(`  ${pid} ${(p?.properties.nombre ?? "").padEnd(28)} → ${String(count).padStart(4)} celdas`);
  });
}

main();
