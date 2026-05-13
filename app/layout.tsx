import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@fontsource-variable/familjen-grotesk";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});
const jbMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

// URL canónica del sitio en producción.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://seguridad.openarg.org");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Mapa de Inseguridad — República Argentina",
  description:
    "Observatorio editorial de estadísticas criminales (SNIC) para las 24 provincias y los 555 departamentos de la Argentina.",
  keywords: [
    "SNIC", "seguridad", "inseguridad", "Argentina", "delitos", "estadísticas criminales",
    "Colossus Lab", "Open Arg", "observatorio", "mapa", "departamentos", "provincias",
    "homicidios", "robos", "Ministerio de Seguridad",
  ],
  authors: [{ name: "Colossus Lab", url: "https://www.colossuslab.org" }],
  creator: "Colossus Lab",
  publisher: "Colossus Lab",
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: SITE_URL,
    siteName: "Colossus Lab · Observatorio Seguridad",
    title: "Mapa de inseguridad · República Argentina",
    description:
      "Observatorio editorial de estadísticas criminales (SNIC) 2000–2024 cubriendo las 24 provincias y los 555 departamentos de la Argentina.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mapa de inseguridad · República Argentina",
    description:
      "Observatorio editorial de estadísticas criminales SNIC 2000–2024. Producción de Colossus Lab.",
    creator: "@colossuslab",
  },
  robots: { index: true, follow: true },
};

// Anti-FOUC: aplica data-theme antes del primer paint según localStorage.
// Default = dark editorial.
const themeBootstrap = `
(function(){
  try {
    var t = localStorage.getItem('openarg-theme');
    if (t === 'light') document.documentElement.setAttribute('data-theme','light');
  } catch(e){}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${jbMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
