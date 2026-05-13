// Genera una máscara que cubre todo el mundo EXCEPTO Argentina.
// Output: public/data/mask.geojson — un único Polygon con world-bbox como outer ring
// y cada provincia argentina como hole interior. Render con fill negro tapa todo lo
// que está fuera del país para enfocar visualmente el observatorio.

import fs from "node:fs";
import path from "node:path";

const IN = path.join(process.cwd(), "public", "data", "pais.geojson");
const OUT = path.join(process.cwd(), "public", "data", "mask.geojson");

// World bbox (web mercator-friendly, evitamos los polos para no romper el render)
const WORLD = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];

function main() {
  const fc = JSON.parse(fs.readFileSync(IN, "utf8"));
  // Cada provincia puede ser Polygon o MultiPolygon. Tomamos sus rings exteriores
  // como holes en nuestro polígono mundial.
  const holes = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (g.type === "Polygon") {
      holes.push(g.coordinates[0]); // sólo outer ring
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates) holes.push(poly[0]);
    }
  }
  // GeoJSON: el primer ring es outer, los siguientes son holes (CCW vs CW no chequeamos;
  // MapLibre interpreta cualquier ring interior como hole independientemente del winding).
  const mask = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [WORLD, ...holes] },
      },
    ],
  };
  fs.writeFileSync(OUT, JSON.stringify(mask));
  const sz = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`✓ ${OUT} — mask con ${holes.length} holes provinciales · ${sz} KB`);
}

main();
