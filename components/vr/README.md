# Maqueta 3D / VR — `/vr`

Maqueta de los departamentos argentinos sobre una mesa: la altura y el color de cada uno son la
tasa SNIC por 100.000 habitantes. Se navega con mouse en pantalla normal y en realidad mixta
(passthrough) o virtual desde el navegador del Meta Quest 3, vía WebXR. No hace falta una app nativa.

- **Stack:** React Three Fiber 9 + `@react-three/xr` 6 (sesiones, controles, manos, hit-test) +
  `@react-three/handle` (agarrar y rotar la maqueta) + `@react-three/uikit` 1 (paneles).
- **Carga:** el bundle 3D solo se descarga en `/vr` (`VRClient` → `dynamic(..., { ssr: false })`).
  El resto del sitio no cambia.

## Correrlo

```bash
npm run dev
```

Abrí http://localhost:3000/vr. En localhost se inyecta un **Meta Quest 3 emulado** (IWER): aparece
su barra de herramientas y quedan activos los botones "Entrar en AR" y "Entrar en VR". En AR el
emulador simula el passthrough con un entorno sintético de oficina. Los controles virtuales se
mueven desde el panel del emulador o con el teclado.

Sin visor ni emulador, la página igual muestra la maqueta: arrastrá para girar, rueda para acercar
y clic en un departamento para ver el detalle.

> El inyector que trae `@react-three/xr` no funciona con iwer ≥ 2.6 en Chrome de escritorio, porque
> `navigator.xr` existe aunque no haya visor. Por eso lo reemplaza `emulador.ts`, que solo corre en
> desarrollo y en localhost, y no entra al bundle de producción.

## Uso dentro del visor

| Acción | Control | Mano |
| --- | --- | --- |
| Seleccionar departamento / botón | Apuntar + gatillo | Apuntar + pellizco |
| Mover la maqueta | Agarrar la placa con el botón lateral | Pellizcar cerca de la placa y arrastrar |
| Rotar la maqueta | Agarrar la perilla amarilla (esquina NE) y girar | Ídem |
| Apoyarla en una mesa real (solo AR) | "Ubicar en mesa" → apuntar a la mesa → gatillo | Ídem con pellizco |

Paneles:
- **Frente:** delito, año, línea de tiempo con play y créditos.
- **Derecha:** detalle del departamento (tasa, variación contra el año anterior, "Ver provincia").
- **Izquierda:** provincias, para ver una sola ampliada.

## Regenerar datos y geometrías

```bash
npm run data:fetch-geom   # una vez: polígonos IGN crudos → scripts/tmp/ (~250 MB)
npm run data:build        # pais.json + geojson del sitio + maqueta VR
npm run data:vr           # solo la maqueta VR (necesita pais.json y el IGN crudo)
npm run data:vr-font      # solo si cambia el charset de la UI (necesita Python + fonttools + brotli)
```

`scripts/build-vr.mjs` hace lo siguiente:
1. Simplifica con mapshaper preservando topología, para que no queden huecos entre departamentos
   (`SIMPLIFY_INTERVAL_M`).
2. Recorta la Antártida y las Georgias/Sandwich del Sur. Malvinas queda.
3. Proyecta a metros de maqueta: 1,3 m de largo norte–sur.
4. Triangula con earcut los techos y las paredes.
5. Escribe:
   - `public/data/vr/meta.json`
   - `geom-<hash>.bin`: posiciones Uint16 + índice de departamento + índices de triángulos.
   - `values-<hash>.bin`: tasa Uint16 por `[delito][año][departamento]`.

Los `.bin` llevan hash porque `vercel.json` sirve `/data/*` como `immutable`. Los delitos del
selector están en `DELITOS_VR`, dentro del mismo script.

| | Antes | Después |
| --- | --- | --- |
| Geometría | IGN crudo: 133 MB, 5,08 M vértices (el geojson del sitio pesa 1,55 MB) | 812 KB (390 KB con gzip), 28 k vértices de contorno, 82 k triángulos |
| Valores | `pais.json`: 3,1 MB | 236 KB (150 KB con gzip), 9 delitos × 25 años |

## Rendimiento

- **Mapa:** un solo mesh, es decir 1 draw call para los 528 polígonos. La altura y el color salen
  de una textura de datos de 528×1 que se interpola en CPU durante la transición, sin reconstruir
  la geometría.
- **Picking:** raycast contra una copia de la geometría con BVH (`three-mesh-bvh`), que se reajusta
  solo al terminar cada transición.
- **Escena completa:** medida en escritorio, 18 draw calls y unos 84 k triángulos. Sin sombras ni
  post-processing; foveación al máximo y la tasa de refresco más alta disponible.

## Probar en el Meta Quest 3

WebXR exige un contexto seguro: HTTPS, o `localhost`.

**Opción A — USB, para iterar rápido (recomendada en desarrollo).** El Quest abre el dev server
de la PC como si fuera su propio `localhost`, así que no necesita certificado.

1. Activá el modo desarrollador del visor desde la app Meta Horizon del celular
   (Dispositivos → Modo desarrollador).
2. Instalá las Android platform-tools (`adb`) en la PC.
3. Conectá el visor por USB-C y aceptá el aviso de depuración USB dentro del visor.
4. En la PC, con `npm run dev` corriendo:

   ```bash
   adb reverse tcp:3000 tcp:3000
   ```

5. En el navegador del Quest abrí `http://localhost:3000/vr` y tocá "Entrar en AR (passthrough)".

**Opción B — Preview de Vercel, para compartir o probar sin cable.** Cada push de la rama genera
una URL de preview con HTTPS: abrila en el navegador del Quest y agregá `/vr`. Si el proyecto tiene
Deployment Protection, primero hay que iniciar sesión en Vercel desde ese navegador, o compartir un
link con bypass.

**Opción C — Túnel**, por ejemplo `cloudflared tunnel --url http://localhost:3000`. Da una URL
HTTPS pública temporal hacia el dev server. Sirve si no hay cable USB ni preview.

## Limitaciones conocidas

- **CABA:** las comunas miden milímetros a escala país. En modo provincia se ven, pero con
  contornos gruesos por la simplificación a 1 km.
- **La Pampa:** entre 2000 y 2021 reportó por Unidad Regional, no por departamento, y en esos años
  aparece en gris (sin dato). Tolhuin y Malvinas no tienen datos SNIC.
- **Valor "Total":** es la suma de las tasas de todos los delitos SNIC, que comparten denominador
  poblacional.
- **Fuente:** las de uikit no tienen acentos ni ñ. `public/vr/fonts/` tiene un MSDF de Familjen
  Grotesk generado por `build-vr-font.mjs`.
