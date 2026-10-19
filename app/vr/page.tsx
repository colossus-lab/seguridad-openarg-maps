import type { Metadata, Viewport } from "next";
import VRClient from "@/components/vr/VRClient";

export const metadata: Metadata = {
  title: "Maqueta 3D · Mapa de Inseguridad — República Argentina",
  description:
    "Maqueta 3D de los departamentos argentinos con la tasa de delitos SNIC 2000–2024. Navegable con mouse o en realidad mixta / virtual con Meta Quest.",
};

export const viewport: Viewport = {
  themeColor: "#06090F",
};

export default function VRPage() {
  return <VRClient />;
}
