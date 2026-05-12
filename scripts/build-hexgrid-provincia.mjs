// Hexgrid fino (~5 km) por provincia. Itera las 24 provincias y emite
// public/data/hexgrid/{provincia_id}.geojson con celdas asignadas a sus departamentos.

import fs from "node:fs";
import path from "node:path";
import * as turf from "@turf/turf";

const IN_PROV = path.join(process.cwd(), "public", "data", "pais.geojson");
const IN_DEP_DIR = path.join(process.cwd(), "public", "data", "departamentos");
const OUT_DIR = path.join(process.cwd(), "public", "data", "hexgrid");

const DEC = 4;
const round = (n) => +n.toFixed(DEC);
const roundCoords = (c) => typeof c[0] === "number" ? [round(c[0]), round(c[1])] : c.map(roundCoords);

// Tamaño de celda por superficie aproximada de la provincia (km²).
// Provincias grandes (Santa Cruz, Chubut, BA): celdas más grandes para no inflar el archivo.
function cellKmForProvincia(provId, areaKm2) {
  if (provId === "02") return 0.6; // CABA muy chica → 0.6 km
  if (areaKm2 > 250000) return 12;  // Santa Cruz, Chubut, Salta, Mendoza grandes…
  if (areaKm2 > 150000) return 8;
  if (areaKm2 > 80000) return 6;
  return 4;
}

function main() {
  if (!fs.existsSync(IN_PROV)) {
    console.error(`No existe ${IN_PROV}.`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const provFc = JSON.parse(fs.readFileSync(IN_PROV, "utf8"));

  let totalCells = 0;
  let totalKb = 0;

  for (const prov of provFc.features) {
    const provId = prov.properties.provincia_id;
    const depPath = path.join(IN_DEP_DIR, `${provId}.geojson`);
    if (!fs.existsSync(depPath)) {
      console.warn(`  ⚠ sin departamentos para ${provId} (${prov.properties.nombre})`);
      continue;
    }
    const depFc = JSON.parse(fs.readFileSync(depPath, "utf8"));
    const bbox = turf.bbox(prov);
    const pad = 0.02;
    const bboxPad = [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad];
    const area = turf.area(prov) / 1e6;
    const cellKm = cellKmForProvincia(provId, area);

    const cells = turf.hexGrid(bboxPad, cellKm, { units: "kilometers" });
    const out = [];
    cells.features.forEach((cell) => {
      const centroid = turf.centroid(cell);
      if (!turf.booleanPointInPolygon(centroid, prov)) return;
      let depId = null;
      for (const d of depFc.features) {
        if (turf.booleanPointInPolygon(centroid, d)) { depId = d.properties.departamento_id; break; }
      }
      cell.properties = { provincia_id: provId, departamento_id: depId };
      cell.geometry.coordinates = roundCoords(cell.geometry.coordinates);
      cell.id = out.length;
      out.push(cell);
    });

    const fc = { type: "FeatureCollection", features: out };
    const outPath = path.join(OUT_DIR, `${provId}.geojson`);
    fs.writeFileSync(outPath, JSON.stringify(fc));
    const sz = fs.statSync(outPath).size / 1024;
    totalCells += out.length;
    totalKb += sz;
    console.log(`  ${provId} ${prov.properties.nombre.padEnd(28)} → cell=${cellKm}km · ${String(out.length).padStart(5)} celdas · ${sz.toFixed(1)} KB`);
  }
  console.log(`✓ Total: ${totalCells} celdas · ${(totalKb/1024).toFixed(1)} MB`);
}

main();
