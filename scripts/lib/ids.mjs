// Tabla de equivalencias de IDs de departamento.
//
// El dataset (SNIC) es la clave primaria del proyecto: las geometrías IGN se
// renombran a códigos SNIC en build-geojson-departamentos, y los códigos SNIC que
// cambiaron a lo largo de la serie se unifican en build-data.

// IGN → SNIC (geometrías).
export const IGN_TO_SNIC = {
  // CABA: IGN codifica las comunas como 02000 + 7·n; SNIC como 02000 + n.
  ...Object.fromEntries(
    Array.from({ length: 15 }, (_, i) => [
      `02${String(7 * (i + 1)).padStart(3, "0")}`,
      `02${String(i + 1).padStart(3, "0")}`,
    ]),
  ),
  "06218": "06217", // Chascomús
  "94008": "94007", // Río Grande
  "94015": "94014", // Ushuaia
};

// SNIC → SNIC (series con cambio de código; se suman en el código canónico).
export const SNIC_ALIASES = {
  "06058": "06658", // Quilmes: 06658 hasta 2022, 06058 desde 2023
};

// Sin equivalente conocido (quedan sin datos / fuera del mapa):
// - Geometrías IGN sin SNIC: 94011 Tolhuin, 94021 Islas del Atlántico Sur, 94028 Antártida Argentina.
// - Filas SNIC sin polígono: xx999 "Departamento sin determinar" y 42001–42004, unidades
//   regionales con las que La Pampa reportó entre 2000 y 2021 (abarcan varios departamentos).
