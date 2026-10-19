"use client";

import dynamic from "next/dynamic";
import Cargando from "./Cargando";

// three / R3F / WebXR solo se descargan en /vr, y nunca se renderizan en el servidor.
const Experience = dynamic(() => import("./Experience"), {
  ssr: false,
  loading: () => <Cargando texto="Cargando motor 3D…" />,
});

export default function VRClient() {
  return <Experience />;
}
