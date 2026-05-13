import { ImageResponse } from "next/og";

// Next.js convención: este archivo genera el og:image automáticamente.
// También funciona como twitter-image cuando se referencia desde metadata.

export const runtime = "edge";
export const alt =
  "Mapa de inseguridad — República Argentina · Observatorio editorial de Colossus Lab sobre estadísticas SNIC 2000–2024";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CINDER = ["#1a1d24", "#3a2a3f", "#6e2a4a", "#b03a48", "#e8743a", "#f4c95d"];

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "60px 70px",
          background:
            "radial-gradient(circle at 80% 20%, #2a1a14 0%, transparent 50%), radial-gradient(circle at 15% 90%, #2a1a14 0%, transparent 45%), linear-gradient(135deg, #1a1208 0%, #100905 100%)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          position: "relative",
        }}
      >
        {/* Top: Colossus institutional chip */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              background: "#f4c95d",
              boxShadow: "0 0 16px rgba(244,201,93,0.55)",
            }}
          />
          <span
            style={{
              fontSize: 16,
              letterSpacing: "0.28em",
              fontWeight: 700,
              color: "rgba(255,255,255,0.92)",
              textTransform: "uppercase",
            }}
          >
            Colossus Lab
          </span>
          <span
            style={{
              display: "block",
              width: 1,
              height: 14,
              background: "rgba(255,255,255,0.22)",
            }}
          />
          <span
            style={{
              fontSize: 14,
              letterSpacing: "0.26em",
              color: "rgba(255,255,255,0.5)",
              textTransform: "uppercase",
            }}
          >
            Observatorio · Seguridad
          </span>
        </div>

        {/* Spacer */}
        <div style={{ height: 90 }} />

        {/* Eyebrow */}
        <div
          style={{
            fontSize: 18,
            letterSpacing: "0.34em",
            color: "#f4c95d",
            fontWeight: 700,
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <span
            style={{
              display: "block",
              width: 32,
              height: 2,
              background: "#f4c95d",
            }}
          />
          Open Arg · SNIC · 2000—2024
        </div>

        {/* Headline serif */}
        <div
          style={{
            marginTop: 28,
            display: "flex",
            flexDirection: "column",
            fontFamily: "ui-serif, Georgia, 'Times New Roman', serif",
            fontWeight: 600,
            letterSpacing: "-0.022em",
            lineHeight: 0.96,
          }}
        >
          <div style={{ fontSize: 124, color: "#ffffff" }}>Mapa de inseguridad</div>
          <div style={{ fontSize: 92, color: "rgba(255,255,255,0.5)" }}>
            República Argentina
          </div>
        </div>

        {/* Subtitle */}
        <div
          style={{
            marginTop: 38,
            fontSize: 24,
            color: "rgba(255,255,255,0.62)",
            maxWidth: 880,
            lineHeight: 1.4,
            letterSpacing: "-0.005em",
          }}
        >
          Observatorio editorial sobre estadísticas criminales de los 24
          partidos provinciales y 555 departamentos de la República Argentina.
        </div>

        {/* Spacer flex */}
        <div style={{ flex: 1 }} />

        {/* Cinder gradient bar — escala de la paleta de la app */}
        <div
          style={{
            display: "flex",
            height: 8,
            borderRadius: 4,
            overflow: "hidden",
            background: `linear-gradient(90deg, ${CINDER.join(", ")})`,
            boxShadow: "0 0 24px rgba(244,201,93,0.18)",
          }}
        />

        {/* Footer */}
        <div
          style={{
            marginTop: 24,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 16,
            letterSpacing: "0.2em",
            color: "rgba(255,255,255,0.48)",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          <span>24 provincias · 555 deps · 33 categorías · 25 años</span>
          <span style={{ color: "rgba(244,201,93,0.85)" }}>colossuslab.org</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
