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
