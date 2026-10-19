export type Provincia = { id: string; nombre: string };
export type Departamento = { id: string; nombre: string; provincia_id: string };
export type Delito = { id: string; nombre: string; fuente: "snic" | "viales" };

export type Dataset = {
  meta: {
    generado: string;
    fuentes: string[];
    unidad_tasa: string;
    nota_genero?: string;
    nota_viales?: string;
    filas_dept_totales?: number;
    filas_dept_usadas?: number;
  };
  provincias: Provincia[];
  departamentos: Departamento[];
  delitos: Delito[];
  anios: number[];
  /** prov_hechos[provIdx][delitoIdx][anioIdx] */
  prov_hechos: number[][][];
  /** prov_tasa[provIdx][delitoIdx][anioIdx] — por 100.000 hab */
  prov_tasa: number[][][];
  /** dep_hechos[depIdx][delitoIdx][anioIdx] */
  dep_hechos: number[][][];
  /** dep_tasa[depIdx][delitoIdx][anioIdx] */
  dep_tasa: number[][][];
};

export type Metric = "hechos" | "tasa";
export type Nivel = "pais" | "provincia";

// --- Experiencia /vr (ver scripts/build-vr.mjs) ---------------------------------------

export type VRDelito = {
  id: string;
  nombre: string;
  /** máximo de la serie: los valores Uint16 se decodifican como q / 65534 * max */
  max: number;
  /** percentil 99, referencia de altura */
  p99: number;
  /** cortes de percentil (todos los años) para la escala de color */
  quantiles: number[];
};

export type VRMeta = {
  generado: string;
  fuente: string;
  unidad: string;
  files: { geom: string; values: string };
  /** ancho (x) y largo (z) de la maqueta, en metros */
  size: [number, number];
  vertexCount: number;
  indexCount: number;
  sinDato: number;
  anios: number[];
  delitos: VRDelito[];
  provincias: { id: string; nombre: string; bbox: [number, number, number, number] }[];
  departamentos: { id: string; nombre: string; provincia_id: string; c: [number, number] }[];
};

export type VRBundle = {
  meta: VRMeta;
  /** [x,z cuantizados (2·V)] [depIdx·2 + techo (V)] [índices (I)] */
  geom: Uint16Array;
  /** [delito][año][depto] */
  values: Uint16Array;
};
