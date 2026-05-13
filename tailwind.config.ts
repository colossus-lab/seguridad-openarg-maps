import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#faf8f4",
        surface: {
          1: "#f3f0ea",
          2: "#e9e6df",
          3: "#ddd8d0",
        },
        ink: {
          DEFAULT: "#101215",
          2: "#3a3d43",
          3: "#66696f",
          4: "#83868e",
        },
        line: {
          subtle: "#0303031a",
          DEFAULT: "#03030326",
          strong: "#0303033d",
        },
        // Paleta Cinder — editorial sequential
        cinder: {
          0: "#1a1d24",
          1: "#3a2a3f",
          2: "#6e2a4a",
          3: "#b03a48",
          4: "#e8743a",
          5: "#f4c95d",
        },
        // Mantenemos emerald minimal (intro, dots) pero la rampa principal es Cinder
        emerald: {
          400: "#00d294",
          500: "#00bb7f",
          600: "#009767",
          700: "#007956",
          900: "#004e3b",
        },
        brand: "#2563eb",
        danger: "#ef4444",
        warning: "#edb200",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
        serif: ["var(--font-serif)"],
      },
      borderRadius: {
        DEFAULT: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
      },
      boxShadow: {
        card: "0 1px 0 rgba(16,18,21,0.03), 0 1px 2px rgba(16,18,21,0.04)",
        float: "0 8px 24px -12px rgba(16,18,21,0.18), 0 2px 4px rgba(16,18,21,0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
