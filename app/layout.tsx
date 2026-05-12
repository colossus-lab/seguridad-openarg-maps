import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});
const jbMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mapa de Inseguridad · República Argentina — Colossus Lab",
  description:
    "Observatorio 3D de estadísticas criminales del SNIC para las 24 provincias y los 555 departamentos de la Argentina.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${jbMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
