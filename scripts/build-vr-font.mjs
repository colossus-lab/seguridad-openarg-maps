// Genera las fuentes MSDF de la experiencia /vr a partir de Familjen Grotesk (la tipografía
// del sitio). Las fuentes que trae @pmndrs/uikit solo cubren ASCII + umlauts: sin á/é/ñ.
//
// Requiere Python con fontTools + brotli (`pip install fonttools brotli`) para pasar el
// woff2 variable a TTF estático. Output: public/vr/fonts/familjen-{500,700}.json + .png.
// Correr una sola vez (o al cambiar el charset): node scripts/build-vr-font.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const SRC = path.join(process.cwd(), "node_modules", "@fontsource-variable", "familjen-grotesk", "files", "familjen-grotesk-latin-wght-normal.woff2");
const OUT_DIR = path.join(process.cwd(), "public", "vr", "fonts");
const WEIGHTS = [500, 700];
// ASCII imprimible + Latin-1 + tipografía usada en la UI.
const CHARSET =
  Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("") +
  "¡¿°ºª·×±«»áéíóúüñÁÉÍÓÚÜÑàèìòùâêîôûçÇãõ–—…‘’“”−↑↓";

const py = `
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
f = instancer.instantiateVariableFont(TTFont(sys.argv[1]), {"wght": int(sys.argv[3])})
f.flavor = None
f.save(sys.argv[2])
`;

// msdf-bmfont-xml no trae msdfgen para win32_arm64; el binario x64 corre emulado.
if (process.platform === "win32" && process.arch === "arm64") {
  Object.defineProperty(process, "arch", { value: "x64" });
}
const generateBMFont = createRequire(import.meta.url)("msdf-bmfont-xml");

function generate(ttf, filename) {
  return new Promise((resolve, reject) => {
    generateBMFont(
      ttf,
      { outputType: "json", filename, fontSize: 48, distanceRange: 4, textureSize: [1024, 1024], charset: CHARSET },
      (err, textures, font) => (err ? reject(err) : resolve({ textures, font })),
    );
  });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vr-font-"));
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const w of WEIGHTS) {
  const ttf = path.join(tmp, `familjen-${w}.ttf`);
  execFileSync("python", ["-c", py, SRC, ttf, String(w)], { stdio: "inherit" });
  const { textures, font } = await generate(ttf, path.join(tmp, `familjen-${w}`));
  if (textures.length !== 1) throw new Error(`Se esperaba 1 página de atlas, hay ${textures.length}`);
  const png = `familjen-${w}.png`;
  fs.writeFileSync(path.join(OUT_DIR, png), textures[0].texture);
  const info = JSON.parse(font.data);
  info.pages = [png];
  fs.writeFileSync(path.join(OUT_DIR, `familjen-${w}.json`), JSON.stringify(info));
  const missing = [...CHARSET].filter((c) => !info.chars.some((g) => g.id === c.codePointAt(0)));
  console.log(`✓ familjen-${w}: ${info.chars.length} glifos${missing.length ? ` · sin glifo: ${missing.join("")}` : ""}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
