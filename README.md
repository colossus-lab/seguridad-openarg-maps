# Mapa de Inseguridad · República Argentina

Dashboard 3D interactivo con drilldown jerárquico (país → provincia → departamento) de las estadísticas criminales del **SNIC** (Sistema Nacional de Información Criminal) y muertes viales del **SAT**, para toda la Argentina, período 2000–2024.

Producto del **Laboratorio Colossus**, clon ampliado del proyecto "Mapa Inseguridad Conurbano".

## Stack

- **Next.js 16** (App Router + Turbopack)
- **React 19** + **TypeScript 5.7** strict
- **MapLibre GL** vía `react-map-gl` (mapa 3D con CARTO dark-matter basemap)
- **Zustand** (estado global)
- **Tailwind 3** (paleta institucional Colossus)
- **Turf.js** (geometría: hexgrid + point-in-polygon)

## Estructura

```
app/                  → Entry Next.js
components/
  ├ DashboardShell.tsx
  └ Vista3DPais.tsx   → Mapa principal con drilldown
lib/
  ├ store.ts          → Estado global (nivel, provSel, depSel, filtros)
  ├ data.ts           → Loaders (cacheo en memoria)
  ├ analytics.ts      → Cálculos sobre el dataset columnar
  └ types.ts
scripts/
  ├ fetch-geom.mjs    → Descarga geometrías Georef (apis.datos.gob.ar)
  ├ build-data.mjs    → ETL: CSVs SNIC + SAT → pais.json
  ├ build-geojson-pais.mjs
  ├ build-geojson-departamentos.mjs
  ├ build-hexgrid-pais.mjs    → Hexgrid grueso (~25 km)
  └ build-hexgrid-provincia.mjs  → Hexgrids finos por provincia
public/data/
  ├ pais.json
  ├ pais.geojson
  ├ departamentos/{provincia_id}.geojson
  ├ hexgrid-pais.geojson
  └ hexgrid/{provincia_id}.geojson
```

## Setup

```bash
npm install
npm run data:fetch-geom    # una sola vez: descarga geometrías Georef (~50 MB)
npm run data:build         # genera todos los artefactos en public/data/
npm run dev                # http://localhost:3000
```

## Fuentes

- **SNIC Departamental** — Ministerio de Seguridad de la Nación.
- **SNIC Provincial** — agregado (calculado desde el departamental).
- **SAT Muertes Viales** — Sistema de Alerta Temprana, agregado por departamento.
- **Geometrías** — IGN vía API Georef del Estado Nacional.

## Estrategia de escala

- **Vista país**: hexgrid grueso (~25 km, ~6 MB) coloreado por valor provincial.
- **Vista provincia (drilldown)**: hexgrid fino (4–12 km según provincia) cargado lazy al hacer click.
- **Datos**: matrices columnares `[provincia/departamento][delito][año]` en un solo `pais.json` (~3–5 MB).

## Licencia

MIT — datos públicos bajo licencia abierta del Estado Nacional Argentino.
