import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // KPMG brand — sidebar uses the deepest navy, primary actions use medium blue
        brand: {
          DEFAULT: "#00338D",
          dark: "#001E5F",
          medium: "#005EB8",
          light: "#0091DA",
          50: "#EAF1FB",
          100: "#D2E0F4",
        },
        // Status palette used across status pills, KPI accents, severity icons
        status: {
          pending: { bg: "#EFF6FF", fg: "#1D4ED8", dot: "#3B82F6" },
          ready: { bg: "#ECFDF5", fg: "#047857", dot: "#10B981" },
          attention: { bg: "#FEF3C7", fg: "#92400E", dot: "#F59E0B" },
          paid: { bg: "#ECFDF5", fg: "#047857", dot: "#10B981" },
          rejected: { bg: "#FEF2F2", fg: "#B91C1C", dot: "#EF4444" },
          processing: { bg: "#EFF6FF", fg: "#1D4ED8", dot: "#3B82F6" },
        },
        severity: {
          blocker: "#B91C1C",
          warning: "#B45309",
          info: "#1D4ED8",
          ok: "#15803D",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Inter", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "hero-soft":
          "linear-gradient(135deg, rgba(0,145,218,0.10) 0%, rgba(0,51,141,0.04) 45%, rgba(255,255,255,0) 70%)",
        "hero-strong":
          "linear-gradient(120deg, #EAF1FB 0%, rgba(234,241,251,0.4) 60%, transparent 90%)",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        cardHover:
          "0 4px 6px -1px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.04)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200px 0" },
          "100%": { backgroundPosition: "calc(200px + 100%) 0" },
        },
      },
      animation: {
        shimmer: "shimmer 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
