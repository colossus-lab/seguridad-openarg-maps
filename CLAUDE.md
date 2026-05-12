# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Interactive 3D dashboard visualizing SNIC (Sistema Nacional de Información Criminal) crime statistics for all 24 Argentine provinces and 555 departamentos, period 2000–2024. Cloned and adapted from the sibling project "Mapa Inseguridad Conurbano" (located at `../Mapa inseguridad Conurbano`) — when in doubt about patterns or design choices, that project is the reference.

## Commands

```bash
npm run dev               # Next.js dev server (Turbopack) on :3000
npm run build             # Production build
npm run lint              # ESLint
npx tsc --noEmit          # Type-check (no test runner in this project)

# Data pipeline (ETL → public/data/*)
npm run data:fetch-geom   # One-time: download provincia/departamento polygons from IGN WFS to scripts/tmp/ (~240 MB raw)
npm run data:build        # Run all build-* scripts in sequence: data → geojson → hexgrids

# Or run individual stages:
node scripts/build-data.mjs                    # SNIC CSVs + Viales SAT → pais.json
node scripts/build-geojson-pais.mjs            # Simplified provincias.geojson
node scripts/build-geojson-departamentos.mjs   # Per-province departamento files
node scripts/build-hexgrid-pais.mjs            # Coarse country hexgrid (HEX_KM env var to override cell size)
node scripts/build-hexgrid-provincia.mjs       # Fine hexgrid per province
```

The data CSVs live at `C:/Users/dante/Desktop/Laboratorio Colossus/Pipeline OpenArg/datos_abiertos/datasets/seguridad/` (paths hardcoded in `scripts/build-data.mjs`; override via `SNIC_DEPT` / `SNIC_VIALES` env vars).

Large geometry transforms need `node --max-old-space-size=8192` (the raw IGN files are 100+ MB).

## Architecture

### Two-level hierarchical drilldown

The whole app is one Vista3D map with two zoom levels controlled by Zustand state:

```
nivel="pais"          → country view: hexgrid-pais (~25 km cells) + provincias.geojson overlay
                       ↓ click on province
nivel="provincia"     → zoomed view: hexgrid/{provId}.geojson (~4-12 km cells) + departamentos/{provId}.geojson
                       ↓ click on departamento
departamentoSel set   → highlight + HoverCard (still in provincia nivel)
```

The country hexgrid is colored by **provincia** value (each cell looks up its parent province in the dataset); the province hexgrid is colored by **departamento** value. This lookup happens in `enrichHexgrid()` inside `components/Vista3DPais.tsx`.

Province-level geometries (`departamentos/{id}.geojson`, `hexgrid/{id}.geojson`) are **lazy-loaded on click** via `lib/data.ts`'s in-memory cache. This is what makes the country-scale map feasible — without lazy loading, a uniform hexgrid for all of Argentina would be tens of MB.

### Dataset shape (`public/data/pais.json`)

Columnar 3D arrays indexed by position:

```ts
{
  provincias:    [{ id: "06", nombre: "Buenos Aires" }, ...]          // 24, sorted by INDEC id
  departamentos: [{ id: "06028", nombre: "...", provincia_id: "06" }] // 555
  delitos:       [{ id: "1", nombre: "Homicidios dolosos", fuente: "snic" | "viales" }, ...]  // 33
  anios:         [2000, ..., 2024]
  prov_hechos[provIdx][delitoIdx][anioIdx]  // raw count
  prov_tasa[provIdx][delitoIdx][anioIdx]    // per 100k (weighted avg of dep tasas)
  dep_hechos[depIdx][delitoIdx][anioIdx]
  dep_tasa[depIdx][delitoIdx][anioIdx]
}
```

Provincia metrics are **derived in the ETL** by summing/averaging the departmental data (not read from the provincial CSV) — keeps both levels consistent. Tasa provincial is computed as a population-weighted average of departmental tasas (weighted by `hechos`), since SNIC's tasa columns are already per-100k.

The "Muertes Viales" (SAT) dataset is appended as a synthetic delito with `id="viales", fuente="viales"`. It only contributes to `dep_hechos` / `prov_hechos` (no tasa — no departmental population data).

### Map rendering pipeline

`Vista3DPais.tsx` is one big component. Key memo chain:

1. `valoresProv` / `valoresDep` — `Map<id, number>` for the current `(delito, año, metric)` filter
2. `hexPaisEnriched` / `hexProvEnriched` — adds `value`, `intensity` (percentile-ranked), and `height` (pow(0.4) compressed) to each hex feature
3. MapLibre `fill-extrusion` layer interpolates color across the intensity 0–1 range (dark green → amber → red)

The color scale is **percentile-based**, not min-max — this keeps cromatic contrast consistent even with skewed distributions (one outlier province doesn't flatten the whole palette).

The `MapGL` import is renamed from react-map-gl's default `Map` to avoid shadowing the global `Map` constructor (used heavily in the memos). If you re-import, keep the alias.

### Build scripts

All ETL is Node ESM (`.mjs`) using `@turf/turf` for geometry ops. `build-data.mjs` uses streaming `readline` (the SNIC departamental CSV is 52 MB, semicolon-delimited; the provincial CSV is comma-delimited).

The geometry pipeline uses **Douglas-Peucker simplification** (`turf.simplify`):
- Provincias: tolerance 0.01° (~1.1 km) → 343 KB
- Departamentos: tolerance 0.003° (~330 m) → 1.5 MB total
- Both also dedupe consecutive identical points after rounding

The hexgrid generator assigns each cell to a province by `booleanPointInPolygon` on the centroid; departamento lookup is restricted to candidates from the matching province (~30× speedup over scanning all 555).

Tierra del Fuego currently emits an oversized hexgrid (~1.6 MB) because IGN's polygon includes the claimed Antarctic territory. Not yet clipped.

## Design system

Identical to "Mapa Inseguridad Conurbano":
- Tailwind palette: paper/surface/ink + emerald 400–900 (institutional Colossus colors). See `tailwind.config.ts`.
- Dark map background `#0a1220` with emerald outlines for polygons
- CARTO dark-matter basemap (no API key required)
- `.eyebrow` (uppercase 10.5px labels), `.num` (tabular-nums), `.mono` classes defined in `app/globals.css`

## Conventions

- All map-rendered code lives in `components/Vista3DPais.tsx` — do not split it without coordinating the memo chain
- Per-province data lazy-loads through `lib/data.ts` which caches in a module-scope `Map`. Always go through these helpers; do not call `fetch` directly from components
- IDs are zero-padded INDEC codes: provincias 2 digits (`"06"`), departamentos 5 digits (`"06028"`). The dataset relies on these as primary keys
- The viales dataset comes in row-per-person format (víctimas+imputados). Hechos are deduplicated by `id_hecho` Set in build-data
- `nivel === "pais"` should always have `provinciaSel === null`; `selectProvincia(id)` is the only correct way to transition
- Do not edit `public/data/*` by hand — regenerate via the pipeline
