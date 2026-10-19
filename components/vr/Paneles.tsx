import { useMemo, type ReactNode } from "react";
import { Container, Svg, Text, type FontFamilies } from "@react-three/uikit";
import { useXR } from "@react-three/xr";
import type { VRBundle } from "@/lib/types";
import { useVR } from "./store";
import { fmtPct, fmtTasa, tasa } from "./datos";

// Paneles en el mundo, anclados a la maqueta. pixelSize 0.001 → 1 px = 1 mm:
// un texto de 18 px mide 18 mm, legible a ~70 cm.
const PX = 0.001;
const FONTS: FontFamilies = {
  familjen: { medium: "/vr/fonts/familjen-500.json", bold: "/vr/fonts/familjen-700.json" },
};
const C = {
  panel: "#0B1220",
  borde: "#22314A",
  boton: "#152036",
  botonHover: "#22324D",
  activo: "#FFD04A",
  texto: "#E8EEF7",
  tenue: "#8C9BB3",
  celeste: "#74ACDF",
  sube: "#F07A4A",
  baja: "#8FBEEA",
};
const ETIQUETA_DELITO: Record<string, string> = {
  total: "Total",
  "1": "Homicidios",
  "15": "Robos",
  "17": "Robos agravados",
  "19": "Hurtos",
  "5": "Lesiones",
  "10": "Abusos sexuales",
  "13": "Amenazas",
  "28": "Estupefacientes",
};
const svg = (path: string, fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${fill}" d="${path}"/></svg>`;
const ICON = {
  play: "M7 4.5v15l12.5-7.5z",
  pausa: "M6 4h4.5v16H6zM13.5 4H18v16h-4.5z",
  prev: "M15.5 4.5L8 12l7.5 7.5 1.8-1.8L11.6 12l5.7-5.7z",
  next: "M8.5 4.5L16 12l-7.5 7.5-1.8-1.8 5.7-5.7-5.7-5.7z",
};

function Panel({ children, width }: { children: ReactNode; width: number }) {
  return (
    <Container
      pixelSize={PX}
      width={width}
      flexDirection="column"
      padding={18}
      gap={12}
      backgroundColor={C.panel}
      borderColor={C.borde}
      borderWidth={1.5}
      borderRadius={16}
      fontFamilies={FONTS}
      fontFamily="familjen"
      color={C.texto}
    >
      {children}
    </Container>
  );
}

function Boton({
  activo, onClick, children, grow, width, height = 34, paddingX = 12,
}: {
  activo?: boolean; onClick: () => void; children: ReactNode; grow?: boolean; width?: number | `${number}%`; height?: number; paddingX?: number;
}) {
  return (
    <Container
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      height={height}
      width={width}
      flexGrow={grow ? 1 : 0}
      flexShrink={0}
      paddingX={paddingX}
      alignItems="center"
      justifyContent="center"
      borderRadius={9}
      backgroundColor={activo ? C.activo : C.boton}
      hover={{ backgroundColor: activo ? C.activo : C.botonHover }}
    >
      {children}
    </Container>
  );
}

function Etiqueta({ activo, children, size = 15 }: { activo?: boolean; children: string; size?: number }) {
  return (
    <Text fontSize={size} fontWeight={activo ? "bold" : "medium"} color={activo ? "#06090F" : C.texto}>
      {children}
    </Text>
  );
}

function Eyebrow({ children, color = C.celeste }: { children: string; color?: string }) {
  return <Text fontSize={11} fontWeight="bold" letterSpacing={1.4} color={color}>{children.toUpperCase()}</Text>;
}

// --- Panel principal: delito, año, línea de tiempo, créditos ---------------------------

function PanelControl({ bundle }: { bundle: VRBundle }) {
  const { meta } = bundle;
  const delitoIdx = useVR((s) => s.delitoIdx);
  const anioIdx = useVR((s) => s.anioIdx);
  const playing = useVR((s) => s.playing);
  const provinciaId = useVR((s) => s.provinciaId);
  const mode = useXR((s) => s.mode);
  const { setDelito, setAnio, setPlaying, setPlacing, setProvincia } = useVR.getState();
  const nA = meta.anios.length;
  const provincia = meta.provincias.find((p) => p.id === provinciaId);

  return (
    <Panel width={780}>
      <Container flexDirection="row" alignItems="flex-end" justifyContent="space-between">
        <Container flexDirection="column" gap={4} flexShrink={1}>
          <Eyebrow>{`Tasa por 100.000 hab. · ${provincia ? provincia.nombre : "República Argentina"}`}</Eyebrow>
          <Text fontSize={28} fontWeight="bold">{meta.delitos[delitoIdx].nombre}</Text>
        </Container>
        <Text fontSize={52} fontWeight="bold" color={C.activo} lineHeight={1}>{String(meta.anios[anioIdx])}</Text>
      </Container>

      <Container flexDirection="row" flexWrap="wrap" gap={6}>
        {meta.delitos.map((d, i) => (
          <Boton key={d.id} activo={i === delitoIdx} onClick={() => setDelito(i)}>
            <Etiqueta activo={i === delitoIdx}>{ETIQUETA_DELITO[d.id] ?? d.nombre}</Etiqueta>
          </Boton>
        ))}
      </Container>

      <Container flexDirection="row" alignItems="center" gap={4}>
        <Boton
          activo={playing}
          width={52}
          height={44}
          paddingX={0}
          onClick={() => {
            if (!playing && anioIdx >= nA - 1) setAnio(0);
            setPlaying(!playing);
          }}
        >
          <Svg content={svg(playing ? ICON.pausa : ICON.play, playing ? "#06090F" : C.texto)} width={22} height={22} />
        </Boton>
        <Boton width={30} height={44} paddingX={0} onClick={() => { setPlaying(false); setAnio(Math.max(0, anioIdx - 1)); }}>
          <Svg content={svg(ICON.prev, C.texto)} width={18} height={18} />
        </Boton>
        {meta.anios.map((a, i) => (
          <Container
            key={a}
            onClick={(e) => { e.stopPropagation(); setPlaying(false); setAnio(i); }}
            flexGrow={1}
            flexShrink={1}
            height={44}
            alignItems="center"
            justifyContent="center"
            borderRadius={6}
            backgroundColor={i === anioIdx ? C.activo : i < anioIdx ? "#1B2A44" : C.boton}
            hover={{ backgroundColor: i === anioIdx ? C.activo : C.botonHover }}
          >
            <Text fontSize={12} fontWeight={i === anioIdx ? "bold" : "medium"} color={i === anioIdx ? "#06090F" : C.tenue}>
              {String(a).slice(2)}
            </Text>
          </Container>
        ))}
        <Boton width={30} height={44} paddingX={0} onClick={() => { setPlaying(false); setAnio(Math.min(nA - 1, anioIdx + 1)); }}>
          <Svg content={svg(ICON.next, C.texto)} width={18} height={18} />
        </Boton>
      </Container>

      <Container flexDirection="row" alignItems="center" justifyContent="space-between" gap={12}>
        <Container flexDirection="column" gap={3} flexShrink={1}>
          <Text fontSize={13} fontWeight="bold" letterSpacing={1.2} color={C.texto}>COLOSSUS LAB</Text>
          <Text fontSize={11} color={C.tenue}>Fuente: SNIC – Ministerio de Seguridad de la Nación</Text>
        </Container>
        <Container flexDirection="row" gap={6}>
          {provinciaId && (
            <Boton onClick={() => setProvincia(null)}><Etiqueta size={13}>País completo</Etiqueta></Boton>
          )}
          {mode === "immersive-ar" && (
            <Boton onClick={() => setPlacing(true)}><Etiqueta size={13}>Ubicar en mesa</Etiqueta></Boton>
          )}
        </Container>
      </Container>
    </Panel>
  );
}

// --- Panel de departamento -------------------------------------------------------------

function PanelDepartamento({ bundle }: { bundle: VRBundle }) {
  const { meta } = bundle;
  const depSel = useVR((s) => s.depSel);
  const depHover = useVR((s) => s.depHover);
  const delitoIdx = useVR((s) => s.delitoIdx);
  const anioIdx = useVR((s) => s.anioIdx);
  const provinciaId = useVR((s) => s.provinciaId);
  const dep = depSel ?? depHover;

  if (dep == null) {
    return (
      <Panel width={320}>
        <Eyebrow>Departamento</Eyebrow>
        <Text fontSize={17} color={C.tenue}>Apuntá o tocá un departamento para ver su tasa.</Text>
      </Panel>
    );
  }

  const d = meta.departamentos[dep];
  const prov = meta.provincias.find((p) => p.id === d.provincia_id);
  const anio = meta.anios[anioIdx];
  const v = tasa(bundle, delitoIdx, anioIdx, dep);
  const vPrev = anioIdx > 0 ? tasa(bundle, delitoIdx, anioIdx - 1, dep) : null;
  const delta = v != null && vPrev != null && vPrev > 0 ? ((v - vPrev) / vPrev) * 100 : null;

  return (
    <Panel width={320}>
      <Container flexDirection="column" gap={4}>
        <Eyebrow>{prov?.nombre ?? ""}</Eyebrow>
        <Text fontSize={24} fontWeight="bold">{d.nombre}</Text>
      </Container>
      {v == null ? (
        <Text fontSize={17} color={C.tenue}>{`Sin dato SNIC en ${anio}.`}</Text>
      ) : (
        <Container flexDirection="column" gap={2}>
          <Text fontSize={44} fontWeight="bold" color={C.activo} lineHeight={1.05}>{fmtTasa(v)}</Text>
          <Text fontSize={13} color={C.tenue}>{`por 100.000 hab. · ${anio}`}</Text>
        </Container>
      )}
      {delta != null ? (
        <Text fontSize={17} fontWeight="bold" color={delta > 0 ? C.sube : C.baja}>
          {`${fmtPct(delta)} vs. ${anio - 1}`}
        </Text>
      ) : (
        v != null && <Text fontSize={14} color={C.tenue}>{`Sin comparación con ${anio - 1}.`}</Text>
      )}
      {depSel != null && (
        <Container flexDirection="row" gap={6}>
          {provinciaId !== d.provincia_id && (
            <Boton grow onClick={() => useVR.getState().setProvincia(d.provincia_id)}>
              <Etiqueta size={13}>Ver provincia</Etiqueta>
            </Boton>
          )}
          <Boton grow onClick={() => useVR.getState().setDepSel(null)}>
            <Etiqueta size={13}>Cerrar</Etiqueta>
          </Boton>
        </Container>
      )}
    </Panel>
  );
}

// --- Panel de provincias ---------------------------------------------------------------

function PanelProvincias({ bundle }: { bundle: VRBundle }) {
  const provinciaId = useVR((s) => s.provinciaId);
  const provincias = useMemo(
    () => [...bundle.meta.provincias].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [bundle],
  );
  const { setProvincia } = useVR.getState();
  return (
    <Panel width={340}>
      <Eyebrow>Ver una provincia</Eyebrow>
      <Boton activo={provinciaId == null} onClick={() => setProvincia(null)}>
        <Etiqueta activo={provinciaId == null}>País completo</Etiqueta>
      </Boton>
      <Container flexDirection="row" flexWrap="wrap" gap={5}>
        {provincias.map((p) => (
          <Boton key={p.id} width="48.5%" height={28} paddingX={6} activo={p.id === provinciaId} onClick={() => setProvincia(p.id)}>
            <Etiqueta size={12} activo={p.id === provinciaId}>{p.nombre}</Etiqueta>
          </Boton>
        ))}
      </Container>
    </Panel>
  );
}

/** Ubicación de los paneles respecto del centro de la maqueta (el norte queda en −z). */
export default function Paneles({ bundle }: { bundle: VRBundle }) {
  const [W, D] = bundle.meta.size;
  return (
    <>
      <group position={[0, 0.07, D / 2 + 0.16]} rotation={[-0.95, 0, 0]}>
        <PanelControl bundle={bundle} />
      </group>
      <group position={[W / 2 + 0.24, 0.24, 0.12]} rotation={[-0.25, -0.55, 0]}>
        <PanelDepartamento bundle={bundle} />
      </group>
      <group position={[-W / 2 - 0.25, 0.27, 0.05]} rotation={[-0.25, 0.55, 0]}>
        <PanelProvincias bundle={bundle} />
      </group>
    </>
  );
}
