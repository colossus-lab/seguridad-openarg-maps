import type { Config } from "tailwindcss";

/* ─────────────────────────────────────────────────────────────────────────────
   Token alias map — OpenArg Editorial re-skin (dark default + light toggle)
   ─────────────────────────────────────────────────────────────────────────────
   Los NOMBRES Tailwind se preservan (paper, surface, ink, line, cinder,
   emerald, amber, rose, brand, warning, danger) para evitar tocar las clases
   en los componentes congelados (Vista3DPais, IntroScreen, DashboardShell).
   Solo se reasignan sus valores hex a la paleta editorial:

     paper        navy base (#06090F)              — antes cream #faf8f4
     surface-*    capas navy elevadas               — antes cream variants
     ink-*        cream cool sobre navy             — antes dark gray
     line-*       hairlines blancas sobre dark      — antes black alphas
     emerald-*    rampa cobalt celeste              — antes verde
     amber-*      rampa sol Argentina (#FFD04A)     — Tailwind default
     rose-*       vermilion editorial (#C03A18)     — Tailwind default
     cinder       choropleth navy→cobalt→sol→verm.  — antes cream→sepia
     brand/warn   acentos                            — recoloreados

   Los valores light viven en globals.css bajo [data-theme="light"] :root.
   Aquí se declaran solo los hex dark — las clases Tailwind se hornean a
   build-time y light se inyecta como custom properties override.
   ─────────────────────────────────────────────────────────────────────────── */

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Papel/superficies — navy editorial
        paper: "#06090F",
        surface: {
          1: "#0D1117",
          2: "#1A2030",
          3: "#252C42",
        },
        // Tinta cream cool sobre dark
        ink: {
          DEFAULT: "#E8ECF4",
          2: "#B8C0D2",
          3: "#8892A8",
          4: "#5F6680",
        },
        // Hairlines sobre dark — whites con alpha
        line: {
          subtle: "rgba(232,236,244,0.10)",
          DEFAULT: "rgba(232,236,244,0.16)",
          strong: "rgba(232,236,244,0.42)",
        },
        // Choropleth secuencial: navy frío → celeste → sol → vermilion caliente
        cinder: {
          0: "#1A2030",
          1: "#3D6FA8",
          2: "#74ACDF",
          3: "#FFD04A",
          4: "#F6B40E",
          5: "#C03A18",
        },
        // "emerald" reasignado a rampa cobalt celeste (Familjen system)
        emerald: {
          300: "#93C5F8",
          400: "#74ACDF",
          500: "#5C97CB",
          600: "#4A82B5",
          700: "#3D6FA8",
          900: "#1A2030",
        },
        // "amber" reasignado a rampa sol Argentina — usado por HUDs en Vista3DPais
        amber: {
          100: "#FFE8B8",
          200: "#93C5F8",  // alias usado en HUD depto como acento celeste-bright
          300: "#FFD04A",  // chrome sol — color principal de hover/active en HUDs
          500: "#F6B40E",  // vermilion-warm (sol bright)
        },
        // "rose" reasignado a vermilion editorial (acento danger en stats)
        rose: {
          300: "#E07A4A",
        },
        brand: "#74ACDF",
        danger: "#C03A18",
        warning: "#FFD04A",
        success: "#74ACDF",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
        // serif y display ambos apuntan a Familjen Grotesk —
        // serif se preserva como alias para no tocar .headline en componentes
        serif: ["var(--font-display)"],
        display: ["var(--font-display)"],
      },
      borderRadius: {
        DEFAULT: "0.125rem",   // 2px — esquinas casi rectas editoriales
        lg: "0.5rem",
        xl: "0.75rem",
      },
      boxShadow: {
        card: "0 1px 0 rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.35)",
        float: "0 12px 36px -16px rgba(116,172,223,0.18), 0 2px 4px rgba(0,0,0,0.4)",
      },
    },
  },
  plugins: [],
} satisfies Config;
