// Descarga geometrías oficiales de provincias y departamentos desde el WFS
// del IGN (Instituto Geográfico Nacional). Cachea localmente en scripts/tmp.

import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "scripts", "tmp");
fs.mkdirSync(OUT_DIR, { recursive: true });

const PROVINCIAS_OUT = path.join(OUT_DIR, "provincias-raw.geojson");
const DEPARTAMENTOS_OUT = path.join(OUT_DIR, "departamentos-raw.geojson");
const BASE = "https://wms.ign.gob.ar/geoserver/ign/wfs";

async function fetchLayer(typeName, outPath) {
  const url = `${BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${typeName}&outputFormat=application/json`;
  console.log(`  GET ${url}`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${typeName} → ${r.status}`);
  const fc = await r.json();
  fs.writeFileSync(outPath, JSON.stringify(fc));
  const sz = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`✓ ${outPath} — ${fc.features.length} features · ${sz} MB`);
}

async function main() {
  console.log("→ Descargando provincias…");
  await fetchLayer("ign:provincia", PROVINCIAS_OUT);
  console.log("→ Descargando departamentos…");
  await fetchLayer("ign:departamento", DEPARTAMENTOS_OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
