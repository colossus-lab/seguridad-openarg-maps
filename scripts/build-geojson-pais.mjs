// Procesa provincias-raw.geojson → public/data/pais.geojson
// - Filtra a las 24 provincias argentinas
// - Reduce precisión a 4 decimales
// - Calcula centroide (para labels)

import fs from "node:fs";
import path from "node:path";
import * as turf from "@turf/turf";

const IN = path.join(process.cwd(), "scripts", "tmp", "provincias-raw.geojson");
const OUT_DIR = path.join(process.cwd(), "public", "data");
const OUT = path.join(OUT_DIR, "pais.geojson");

// 3 decimales = ~110m de precisión. Suficiente para mostrar provincias a nivel país.
const DEC = 3;
const round = (n) => +n.toFixed(DEC);
function roundCoords(c) {
  if (typeof c[0] === "number") return [round(c[0]), round(c[1])];
  // Para rings: dedupe puntos consecutivos idénticos tras redondear.
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

function main() {
  if (!fs.existsSync(IN)) {
    console.error(`No existe ${IN}. Corré primero: npm run data:fetch-geom`);
    process.exit(1);
  }
  const fc = JSON.parse(fs.readFileSync(IN, "utf8"));
  const feats = fc.features.map((f) => {
    // IGN: properties.in1 (id INDEC), properties.nam (nombre).
    const id = pad2(f.properties.in1 ?? f.properties.id);
    const nombre = f.properties.nam ?? f.properties.fna ?? f.properties.nombre;
    let geom = f.geometry;
    // Clip Tierra del Fuego — descartamos polígonos al sur de -56° (Antártida + islas).
    if (id === "94" && geom.type === "MultiPolygon") {
      const minLatOfPoly = (poly) => {
        let m = Infinity;
        const walk = (c) => {
          if (typeof c[0] === "number") { if (c[1] < m) m = c[1]; return; }
          c.forEach(walk);
        };
        walk(poly);
        return m;
      };
      const parts = geom.coordinates.filter((poly) => minLatOfPoly(poly) >= -56);
      if (parts.length > 0) geom = { type: parts.length === 1 ? "Polygon" : "MultiPolygon", coordinates: parts.length === 1 ? parts[0] : parts };
    }
    // Douglas-Peucker (tolerance en grados, ~0.01° ≈ 1.1 km).
    const simplified = turf.simplify(
      { type: "Feature", properties: {}, geometry: geom },
      { tolerance: 0.01, highQuality: false, mutate: false },
    );
    const rounded = roundCoords(simplified.geometry.coordinates);
    const centroid = approxCentroid(rounded);
    return {
      type: "Feature",
      properties: { provincia_id: id, nombre, centroid },
      geometry: { type: f.geometry.type, coordinates: rounded },
    };
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = { type: "FeatureCollection", features: feats };
  fs.writeFileSync(OUT, JSON.stringify(out));
  const sizeKb = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`✓ ${OUT} — ${feats.length} provincias — ${sizeKb} KB`);
}

main();
