// Concatena los 24 archivos de departamentos en uno solo.
// Output: public/data/departamentos.geojson (~1.5 MB con los 555 polígonos)

import fs from "node:fs";
import path from "node:path";

const IN_DIR = path.join(process.cwd(), "public", "data", "departamentos");
const OUT = path.join(process.cwd(), "public", "data", "departamentos.geojson");

function main() {
  if (!fs.existsSync(IN_DIR)) {
    console.error(`No existe ${IN_DIR}. Corré antes build-geojson-departamentos.mjs`);
    process.exit(1);
  }
  const features = [];
  for (const f of fs.readdirSync(IN_DIR).sort()) {
    if (!f.endsWith(".geojson")) continue;
    const fc = JSON.parse(fs.readFileSync(path.join(IN_DIR, f), "utf8"));
    features.push(...fc.features);
  }
  const out = { type: "FeatureCollection", features };
  fs.writeFileSync(OUT, JSON.stringify(out));
  const sz = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`✓ ${OUT} — ${features.length} departamentos · ${sz} KB`);
}

main();
