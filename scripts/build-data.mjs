// ETL: SNIC departamental + SNIC provincial + Muertes Viales SAT → public/data/pais.json
// Produce un payload columnar [provincia/departamento][delito][año].

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const SEG = "C:/Users/dante/Desktop/Laboratorio Colossus/Pipeline OpenArg/datos_abiertos/datasets/seguridad";
const CSV_DEPT = process.env.SNIC_DEPT ?? `${SEG}/seguridad-snic-departamental-estadisticas-criminales-republica-argentina-por-departamentos/estadísticas-criminales-en-la-república-argentina-por-departamentos-(panel)-(.csv).csv`;
const CSV_VIALES = process.env.SNIC_VIALES ?? `${SEG}/seguridad-muertes-viales-sistema-alerta-temprana-estadisticas-criminales-republica-argentina/hechos-y-víctimas-de-muertes-viales-en-la-república-argentina.-total-nacional-(panel)-(.csv).csv`;

const OUT_DIR = path.join(process.cwd(), "public", "data");
const OUT_JSON = path.join(OUT_DIR, "pais.json");

// 24 provincias INDEC.
const PROVINCIAS = [
  { id: "02", nombre: "Ciudad Autónoma de Buenos Aires" },
  { id: "06", nombre: "Buenos Aires" },
  { id: "10", nombre: "Catamarca" },
  { id: "14", nombre: "Córdoba" },
  { id: "18", nombre: "Corrientes" },
  { id: "22", nombre: "Chaco" },
  { id: "26", nombre: "Chubut" },
  { id: "30", nombre: "Entre Ríos" },
  { id: "34", nombre: "Formosa" },
  { id: "38", nombre: "Jujuy" },
  { id: "42", nombre: "La Pampa" },
  { id: "46", nombre: "La Rioja" },
  { id: "50", nombre: "Mendoza" },
  { id: "54", nombre: "Misiones" },
  { id: "58", nombre: "Neuquén" },
  { id: "62", nombre: "Río Negro" },
  { id: "66", nombre: "Salta" },
  { id: "70", nombre: "San Juan" },
  { id: "74", nombre: "San Luis" },
  { id: "78", nombre: "Santa Cruz" },
  { id: "82", nombre: "Santa Fe" },
  { id: "86", nombre: "Santiago del Estero" },
  { id: "90", nombre: "Tucumán" },
  { id: "94", nombre: "Tierra del Fuego, Antártida e Islas del Atlántico Sur" },
];
const PROVINCIA_IDX = new Map(PROVINCIAS.map((p, i) => [p.id, i]));

// Curated names for SNIC parent codes.
const DELITO_NAMES = {
  "1": "Homicidios dolosos",
  "2": "Homicidios dolosos (tentativa)",
  "3": "Muertes en accidentes viales",
  "4": "Homicidios culposos (otros)",
  "5": "Lesiones dolosas",
  "6": "Lesiones culposas viales",
  "7": "Lesiones culposas (otras)",
  "8": "Otros delitos contra las personas",
  "9": "Delitos contra el honor",
  "10": "Abusos sexuales con acceso carnal",
  "11": "Otros delitos contra la integridad sexual",
  "12": "Delitos contra el estado civil",
  "13": "Amenazas",
  "14": "Delitos contra la libertad",
  "15": "Robos",
  "16": "Tentativas de robo",
  "17": "Robos agravados (con lesiones/muertes)",
  "18": "Tentativas de robo agravado",
  "19": "Hurtos",
  "20": "Tentativas de hurto",
  "21": "Otros delitos contra la propiedad",
  "22": "Delitos contra la seguridad pública",
  "23": "Delitos contra el orden público",
  "24": "Delitos contra la seguridad de la nación",
  "25": "Delitos contra poderes públicos",
  "26": "Delitos contra la administración pública",
  "27": "Delitos contra la fe pública",
  "28": "Estupefacientes (Ley 23.737)",
  "29": "Otros delitos (leyes especiales)",
  "30": "Contravenciones",
  "31": "Suicidios (consumados)",
  "32": "Delitos contra el orden económico",
};
// Synthetic delito id for muertes viales SAT (independiente del catálogo SNIC).
const VIALES_DELITO_ID = "viales";

function parentDelitoId(snicId) {
  if (!snicId) return null;
  const s = String(snicId).trim();
  const idx = s.indexOf("_");
  return idx === -1 ? s : s.slice(0, idx);
}
function toNum(v) {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function pad2(id) { return String(id).padStart(2, "0"); }
function pad5(id) { return String(id).padStart(5, "0"); }

async function readSnicDepartamental() {
  // Map<provincia_id, Map<departamento_id, { nombre, byDelito: Map<delito, Map<anio, {h,vM,vF,vSD,tSum,tN}>> }>>
  const acc = new Map();
  const departamentosNombre = new Map(); // dep_id -> nombre
  const delitosSeen = new Map(); // parent -> nombre
  const aniosSeen = new Set();

  const stream = fs.createReadStream(CSV_DEPT, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let header = null;
  let idx = {};
  let rowCount = 0;
  let keptCount = 0;

  for await (const rawLine of rl) {
    const line = rawLine.replace(/﻿/g, "");
    if (!line) continue;
    const cols = line.split(";");
    if (!header) {
      header = cols;
      header.forEach((h, i) => (idx[h.trim()] = i));
      continue;
    }
    rowCount++;

    const provId = pad2(cols[idx.provincia_id]);
    if (!PROVINCIA_IDX.has(provId)) continue;
    const depRaw = cols[idx.departamento_id];
    if (!depRaw) continue;
    const depId = pad5(depRaw);

    const snicId = cols[idx.codigo_delito_snic_id];
    const parent = parentDelitoId(snicId);
    if (!parent) continue;
    const anio = Number(cols[idx.anio]);
    if (!Number.isFinite(anio) || anio < 2000) continue;

    const hechos = toNum(cols[idx.cantidad_hechos]);
    const vM = toNum(cols[idx.cantidad_victimas_masc]);
    const vF = toNum(cols[idx.cantidad_victimas_fem]);
    const vSD = toNum(cols[idx.cantidad_victimas_sd]);
    const tasa = toNum(cols[idx.tasa_hechos]);

    aniosSeen.add(anio);
    if (!delitosSeen.has(parent)) {
      delitosSeen.set(parent, DELITO_NAMES[parent] ?? (cols[idx.codigo_delito_snic_nombre] || `Delito ${parent}`));
    }
    if (!departamentosNombre.has(depId)) {
      departamentosNombre.set(depId, (cols[idx.departamento_nombre] || `Dep ${depId}`));
    }

    let byDep = acc.get(provId);
    if (!byDep) { byDep = new Map(); acc.set(provId, byDep); }
    let depEntry = byDep.get(depId);
    if (!depEntry) { depEntry = new Map(); byDep.set(depId, depEntry); }
    let byAnio = depEntry.get(parent);
    if (!byAnio) { byAnio = new Map(); depEntry.set(parent, byAnio); }
    let entry = byAnio.get(anio);
    if (!entry) { entry = { h: 0, vM: 0, vF: 0, vSD: 0, tSum: 0, tN: 0 }; byAnio.set(anio, entry); }
    entry.h += hechos;
    entry.vM += vM;
    entry.vF += vF;
    entry.vSD += vSD;
    if (tasa > 0) { entry.tSum += tasa; entry.tN += 1; }

    keptCount++;
  }

  return { acc, departamentosNombre, delitosSeen, aniosSeen, rowCount, keptCount };
}

async function readViales() {
  // SAT viales: row-per-persona (víctimas+imputados). Para que no contemos doble por hecho,
  // agrupamos por id_hecho usando un Set, y sumamos cantidad_victimas leyendo víctimas únicamente.
  const hechosUnicos = new Map(); // depId -> Map<anio, {h:Set<id_hecho>, v:0}>
  if (!fs.existsSync(CSV_VIALES)) {
    console.warn("⚠ CSV viales no encontrado, salteando:", CSV_VIALES);
    return hechosUnicos;
  }

  const stream = fs.createReadStream(CSV_VIALES, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let header = null;
  let idx = {};
  for await (const rawLine of rl) {
    const line = rawLine.replace(/﻿/g, "");
    if (!line) continue;
    const cols = line.split(";");
    if (!header) {
      header = cols;
      header.forEach((h, i) => (idx[h.trim()] = i));
      continue;
    }
    const idHecho = cols[idx.id_hecho];
    const tipoPersona = cols[idx.tipo_persona]; // contamos "Víctima" para v; hecho único por id_hecho
    const provRaw = cols[idx.provincia_id];
    const depRaw = cols[idx.departamento_id];
    const anio = Number(cols[idx.anio]);
    if (!provRaw || !depRaw || !Number.isFinite(anio)) continue;

    const provId = pad2(provRaw);
    if (!PROVINCIA_IDX.has(provId)) continue;
    const depId = pad5(depRaw);

    let byA = hechosUnicos.get(depId);
    if (!byA) { byA = new Map(); hechosUnicos.set(depId, byA); }
    let entry = byA.get(anio);
    if (!entry) { entry = { h: new Set(), v: 0 }; byA.set(anio, entry); }
    entry.h.add(idHecho);
    if (tipoPersona === "Víctima") entry.v += 1;
  }
  return hechosUnicos;
}

async function main() {
  if (!fs.existsSync(CSV_DEPT)) {
    console.error("CSV departamental no encontrado:", CSV_DEPT);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("→ Leyendo SNIC departamental…");
  const { acc, departamentosNombre, delitosSeen, aniosSeen, rowCount, keptCount } = await readSnicDepartamental();
  console.log(`  filas=${rowCount} usadas=${keptCount} departamentos=${departamentosNombre.size}`);

  console.log("→ Leyendo Muertes Viales SAT…");
  const viales = await readViales();
  console.log(`  departamentos con datos viales=${viales.size}`);

  // Cataloga delitos (orden por id numérico cuando aplica; viales al final).
  const delitos = [
    ...[...delitosSeen.entries()]
      .map(([id, nombre]) => ({ id, nombre, fuente: "snic" }))
      .sort((a, b) => Number(a.id) - Number(b.id)),
  ];
  if (viales.size > 0) {
    delitos.push({ id: VIALES_DELITO_ID, nombre: "Muertes viales (SAT)", fuente: "viales" });
  }

  // Lista departamentos ordenada por provincia_id + departamento_id.
  const departamentos = [];
  PROVINCIAS.forEach((p) => {
    const byDep = acc.get(p.id);
    if (!byDep) return;
    [...byDep.keys()].sort().forEach((depId) => {
      departamentos.push({ id: depId, nombre: departamentosNombre.get(depId) ?? depId, provincia_id: p.id });
    });
  });
  // Aniadir departamentos que aparecen solo en viales pero no en SNIC.
  const depSet = new Set(departamentos.map((d) => d.id));
  viales.forEach((_byA, depId) => {
    if (!depSet.has(depId)) {
      const provId = depId.slice(0, 2);
      if (PROVINCIA_IDX.has(provId)) {
        departamentos.push({ id: depId, nombre: `Dep ${depId}`, provincia_id: provId });
        depSet.add(depId);
      }
    }
  });
  departamentos.sort((a, b) => a.id.localeCompare(b.id));

  const anios = [...aniosSeen].sort((a, b) => a - b);
  // Si viales tiene años fuera del rango SNIC, los ignoramos para mantener un eje consistente.

  const nP = PROVINCIAS.length;
  const nDep = departamentos.length;
  const nD = delitos.length;
  const nA = anios.length;
  const anioIdx = new Map(anios.map((a, i) => [a, i]));
  const depIdx = new Map(departamentos.map((d, i) => [d.id, i]));
  const delitoIdx = new Map(delitos.map((d, i) => [d.id, i]));

  const mk3 = (a, b, c) => Array.from({ length: a }, () => Array.from({ length: b }, () => new Array(c).fill(0)));

  // Departamento-level matrices.
  const dep_hechos = mk3(nDep, nD, nA);
  const dep_tasa = mk3(nDep, nD, nA);

  // Provincia-level matrices (agregado por suma de departamentos de hechos; tasa: promedio ponderado por hechos).
  const prov_hechos = mk3(nP, nD, nA);
  // Para tasa provincial, vamos a promediar tasa por departamento ponderado por hechos.
  // Inicialmente acumulamos {tasaW, hechosTot} y luego dividimos.
  const prov_tasa_w = mk3(nP, nD, nA);
  const prov_tasa_h = mk3(nP, nD, nA);

  // Vuelca SNIC.
  acc.forEach((byDep, provId) => {
    const pi = PROVINCIA_IDX.get(provId);
    byDep.forEach((byDelito, depId) => {
      const dpi = depIdx.get(depId);
      if (dpi == null) return;
      byDelito.forEach((byAnio, delitoId) => {
        const di = delitoIdx.get(delitoId);
        if (di == null) return;
        byAnio.forEach((entry, anio) => {
          const ai = anioIdx.get(anio);
          if (ai == null) return;
          dep_hechos[dpi][di][ai] = entry.h;
          const tasa = entry.tN > 0 ? +(entry.tSum / entry.tN).toFixed(2) : 0;
          dep_tasa[dpi][di][ai] = tasa;
          prov_hechos[pi][di][ai] += entry.h;
          if (tasa > 0 && entry.h > 0) {
            prov_tasa_w[pi][di][ai] += tasa * entry.h;
            prov_tasa_h[pi][di][ai] += entry.h;
          } else if (tasa > 0) {
            prov_tasa_w[pi][di][ai] += tasa;
            prov_tasa_h[pi][di][ai] += 1;
          }
        });
      });
    });
  });

  // Vuelca viales.
  if (viales.size > 0) {
    const vDi = delitoIdx.get(VIALES_DELITO_ID);
    viales.forEach((byA, depId) => {
      const dpi = depIdx.get(depId);
      if (dpi == null) return;
      const provId = depId.slice(0, 2);
      const pi = PROVINCIA_IDX.get(provId);
      byA.forEach((entry, anio) => {
        const ai = anioIdx.get(anio);
        if (ai == null) return;
        const h = entry.h.size;
        dep_hechos[dpi][vDi][ai] = h;
        prov_hechos[pi][vDi][ai] += h;
        // Sin población por departamento, dejamos tasa=0 para viales (sólo absolutos).
      });
    });
  }

  // Resuelve tasa provincial promediada.
  const prov_tasa = mk3(nP, nD, nA);
  for (let pi = 0; pi < nP; pi++)
    for (let di = 0; di < nD; di++)
      for (let ai = 0; ai < nA; ai++)
        prov_tasa[pi][di][ai] = prov_tasa_h[pi][di][ai] > 0
          ? +(prov_tasa_w[pi][di][ai] / prov_tasa_h[pi][di][ai]).toFixed(2)
          : 0;

  const payload = {
    meta: {
      generado: new Date().toISOString(),
      fuentes: [
        "SNIC Departamental — Ministerio de Seguridad de la Nación",
        "SNIC Provincial — Ministerio de Seguridad de la Nación",
        "SAT Muertes Viales — Ministerio de Seguridad de la Nación",
      ],
      unidad_tasa: "por 100.000 habitantes",
      nota_genero: "Desglose M/F de víctimas disponible solo para algunos delitos contra las personas.",
      nota_viales: "Muertes viales agregadas por departamento desde el SAT (sin tasa por falta de pob. departamental).",
      filas_dept_totales: rowCount,
      filas_dept_usadas: keptCount,
    },
    provincias: PROVINCIAS,
    departamentos,
    delitos,
    anios,
    prov_hechos,
    prov_tasa,
    dep_hechos,
    dep_tasa,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(payload));
  const sizeKb = (fs.statSync(OUT_JSON).size / 1024).toFixed(1);
  console.log(`✓ ${OUT_JSON} (${sizeKb} KB)`);
  console.log(`  provincias=${nP} departamentos=${nDep} delitos=${nD} anios=${nA} (${anios[0]}..${anios[nA - 1]})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
