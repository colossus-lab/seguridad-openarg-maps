# Mapa de Inseguridad · República Argentina

**Observatorio editorial interactivo sobre estadísticas criminales SNIC 2000–2024.**
Una producción de [Colossus Lab](https://www.colossuslab.org).

[![Datos SNIC](https://img.shields.io/badge/Datos-SNIC%202000--2024-2a1410?style=flat-square)](https://www.argentina.gob.ar/seguridad/estadisticascriminales)
[![Geometrías IGN](https://img.shields.io/badge/Geometr%C3%ADas-IGN-6e2a1a?style=flat-square)](https://www.ign.gob.ar)
[![Colossus Lab](https://img.shields.io/badge/Producci%C3%B3n-Colossus%20Lab-984a3a?style=flat-square)](https://www.colossuslab.org)

---

## Qué es

Dashboard interactivo que visualiza microdatos del **Sistema Nacional de Información Criminal (SNIC)** del Ministerio de Seguridad de la Nación cubriendo:

- **24 provincias** + Ciudad Autónoma de Buenos Aires
- **555 departamentos** (incluyendo comunas de CABA y partidos de Buenos Aires)
- **33 categorías delictivas** + Muertes Viales (SAT)
- **25 años** de serie temporal continua (2000–2024)

Es una ilustración a tinta sobre papel — un mapa editorial pensado para investigación periodística, análisis territorial y comunicación pública, no para operaciones policiales.

---

## Cómo se lee el mapa

### El "papel" y la "tinta"

El mapa está pensado como una **ilustración a tinta sepia sobre papel apoyado en un escritorio**:

- **Papel** (cream `#f0e3c8`): la silueta de Argentina
- **Tinta**: cada departamento se pinta más oscuro a medida que el indicador es mayor
- **Aguada de fondo**: un halo continuo entre departamentos vecinos para mostrar que los fenómenos no respetan fronteras administrativas
- **Líneas a tinta**: bordes provinciales gruesos, departamentales más sutiles

### La paleta

| Color    | Significado                                                |
|----------|------------------------------------------------------------|
| `#ebe0c4` | Papel natural — valor cercano a cero o sin datos          |
| `#d4b88a` | Arena — valor bajo                                         |
| `#b08458` | Sienna quemado — valor medio-bajo                          |
| `#984a3a` | Terracotta — valor medio                                   |
| `#6e2a1a` | Rojo profundo — valor alto                                 |
| `#2a1410` | Tinta oscura — valor muy alto (peak)                       |

La escala es **por percentil**, no lineal. Esto significa que el color refleja la posición relativa del departamento dentro del país para esa categoría, no su magnitud absoluta. Es una decisión deliberada: con escalas lineales, los outliers (CABA, Rosario, Conurbano) aplastarían toda la paleta y el resto del país se vería uniforme.

---

## Cómo navegar

### Filtros (sidebar izquierda)

Tres controles que determinan **qué** se está mirando:

1. **Tipo de delito**: 33 categorías SNIC + Muertes Viales. Hay una opción "Todos los delitos (suma SNIC)" que agrega todo.
2. **Métrica**:
   - **Tasa /100k**: hechos cada 100.000 habitantes — buena para comparar entre departamentos de distinto tamaño
   - **Hechos**: cantidad absoluta — mejor cuando interesa el volumen total, no la incidencia
3. **Año**: slider 2000 → 2024. La métrica del año seleccionado define el coloreo del mapa.

### Drill-in jerárquico

El mapa tiene dos niveles de detalle:

1. **Vista país** (default): Argentina entera, coloreada por departamento.
2. **Vista provincia**: hacé click en cualquier departamento → la cámara se mueve hacia la provincia que lo contiene, la inclina ligeramente para perspectiva editorial, y aparece a la derecha un **HUD** con la información detallada.

Dentro de la vista provincia, otro click sobre un departamento abre un HUD más fino con la información de ese departamento puntual.

**ESC** retrocede un nivel: depto → provincia → país.

### El HUD (panel lateral derecho)

Cuando seleccionás una provincia o departamento, aparece un panel con:

- **Nombre** (en serif editorial)
- **3 stats comparativas**:
  - **Tasa /100k**: incidencia cada 100k habitantes
  - **Hechos**: total absoluto en el año seleccionado
  - **Δ 5 años**: variación porcentual contra el promedio de los 5 años previos. Verde si bajó >5%, rojo si subió >5%, blanco si estable.
- **Top 5 categorías** del año seleccionado, cada una con:
  - Nombre del delito
  - Barra de proporción (relativa al top 1)
  - **Sparkline de evolución** (últimos 5 años — línea con área tenue)
  - Total absoluto + % del total

El sparkline muestra de un vistazo si la categoría está creciendo, cayendo, o estancada, sin necesidad de cambiar el año seleccionado.

---

## Cómo interpretar las métricas

### Tasa cada 100.000 habitantes

> Tasa = (hechos en el departamento × 100.000) / población del departamento

Calculada directamente por el SNIC sobre proyecciones poblacionales INDEC. Es la métrica estándar para comparar incidencia delictiva entre territorios de distinto tamaño.

### Hechos absolutos

Cantidad total de hechos registrados en el departamento en ese año. **No tiene en cuenta el tamaño poblacional** — un departamento muy poblado va a mostrar más hechos que uno chico, aunque su tasa pueda ser menor.

### Δ 5 años (delta interanual)

> Δ = ((valor actual − promedio de los 5 años previos) / promedio de los 5 años previos) × 100

Buena para identificar **tendencias** sin que un outlier de un solo año domine la lectura. Es la métrica que aparece en el HUD pero no se usa para el coloreo del mapa.

---

## Categorías cubiertas

El dashboard agrupa los códigos SNIC en sus **códigos padre** (33 categorías a nivel de subcapítulo):

**Contra las personas**
- Homicidios dolosos · Homicidios dolosos (tentativa) · Homicidios culposos viales · Otros homicidios culposos · Lesiones dolosas · Lesiones culposas viales · Otras lesiones culposas · Suicidios · Otros delitos contra las personas

**Contra la integridad sexual**
- Abusos sexuales con acceso carnal · Otros delitos contra la integridad sexual

**Contra la libertad y otros**
- Amenazas · Delitos contra la libertad · Delitos contra el honor

**Contra la propiedad**
- Robos · Tentativas de robo · Robos agravados (con lesiones o muertes) · Tentativas de robo agravado · Hurtos · Tentativas de hurto · Otros delitos contra la propiedad

**Contra el orden público y la administración**
- Delitos contra la seguridad pública · Delitos contra el orden público · Delitos contra la seguridad de la nación · Delitos contra poderes públicos · Delitos contra la administración pública · Delitos contra la fe pública · Delitos contra el estado civil · Delitos contra el orden económico

**Leyes especiales**
- Estupefacientes (Ley 23.737) · Otros delitos de leyes especiales · Contravenciones

**Categoría adicional**
- **Muertes Viales (SAT)** — agregado desde el Sistema de Alerta Temprana del Ministerio. A diferencia del SNIC, sólo se reporta en hechos absolutos (sin tasa, por falta de denominador poblacional departamental).

---

## Fuentes

- **SNIC Departamental** — Ministerio de Seguridad de la Nación. Estadísticas criminales por departamento, 2000–2024.
  → https://www.argentina.gob.ar/seguridad/estadisticascriminales
- **SNIC Provincial** — derivado del Departamental (sumas por provincia y promedios ponderados de tasa)
- **SAT Muertes Viales** — Sistema de Alerta Temprana. Registro de hechos viales fatales a nivel departamento
- **Geometrías oficiales** — Instituto Geográfico Nacional (IGN), capa `ign:provincia` e `ign:departamento`
  → https://www.ign.gob.ar

Todos los datasets bajo licencia pública del Estado Nacional Argentino.

---

## Notas metodológicas y limitaciones

- **La tasa /100k viene pre-calculada** por SNIC sobre denominadores poblacionales departamentales (proyecciones INDEC). Para la tasa provincial usamos el promedio ponderado por hechos de las tasas departamentales — preserva la coherencia matemática del agregado.
- **Departamentos sin datos** (algunos departamentos chicos pueden tener años sin registros SNIC) se pintan con el color base del papel. No se interpolan ni se ocultan.
- **El halo de aguada** (las isobandas detrás de los polígonos administrativos) se computa por interpolación IDW (inverse-distance weighting) sobre los centroides de los departamentos. Es una visualización del *campo continuo* del fenómeno, no un dato adicional — siempre mirá los polígonos como referencia primaria.
- **CABA** se presenta como 15 comunas (no como un solo polígono) para coherencia con la granularidad del resto del país.
- **Suicidios** y otras categorías sensibles deben usarse con extremo cuidado en comunicación pública — son fenómenos de salud mental que el SNIC registra pero cuya tasa no debe leerse como un indicador de "inseguridad" en el sentido tradicional.

---

## Créditos

**Colossus Lab** — Observatorio · Seguridad
→ [colossuslab.org](https://www.colossuslab.org)

Producido en el marco del programa **Open Arg** — iniciativas de transparencia y acceso a datos públicos argentinos.

Diseño editorial inspirado en la tradición cartográfica de Financial Times, NYT Upshot y Reuters Graphics.

---

## Licencia

Código bajo licencia **MIT**.
Los datos visualizados son de dominio público bajo licencia abierta del Estado Nacional Argentino.

---

## Deploy

Para desplegar tu propia copia en Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcolossus-lab%2Fseguridad-openarg-maps)

Una vez clonado e importado en Vercel, no necesitás configurar nada — el dashboard es 100% estático y todos los datos están pre-procesados en el repo.
