import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-onest)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        // Поверхности — прохладный бетон
        paper: "#F3F5F4",
        surface: {
          DEFAULT: "#FBFCFB",
          sunken: "#ECEFEE",
        },
        hairline: "#DDE3E1",
        "border-strong": "#C7CFCD",
        // Чернила
        ink: {
          DEFAULT: "#10201F",
          2: "#3A4A48",
          3: "#64748B",
          4: "#94A3A0",
        },
        // Акцент — чернила-бирюза
        accent: {
          DEFAULT: "#0E6E6E",
          hover: "#0B5A5A",
          pressed: "#084848",
          soft: "#E1EEED",
        },
        // Семантика — приглушённая
        success: { DEFAULT: "#2E6B4F", soft: "#E4EFEA" },
        warning: { DEFAULT: "#B4671C", soft: "#F6ECDD" },
        danger: { DEFAULT: "#A93B32", soft: "#F5E3E1" },
      },
      borderRadius: {
        field: "6px",
        card: "10px",
        modal: "14px",
      },
      boxShadow: {
        overlay: "0 8px 24px -8px rgba(16,32,31,.18)",
        "row-active": "inset 2px 0 0 #0E6E6E",
      },
      ringColor: {
        accent: "rgba(14,110,110,.35)",
      },
      keyframes: {
        flash: {
          "0%": { background: "#E1EEED", boxShadow: "inset 2px 0 0 #0E6E6E" },
          "100%": { background: "#FBFCFB", boxShadow: "inset 0 0 0 transparent" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        flash: "flash 1.2s ease-out",
        shimmer: "shimmer 1.4s linear infinite",
      },
      transitionTimingFunction: {
        terminal: "cubic-bezier(.2,.6,.2,1)",
      },
    },
  },
  plugins: [],
};
export default config;
