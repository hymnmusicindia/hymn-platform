import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--bg)",
        card: "var(--card)",
        surface: "var(--surface)",
        elevated: "var(--bg-elevated)",
        foreground: "var(--text)",
        muted: "var(--text-muted)",
        border: "var(--border)",
        ink: "#07111b",
        panel: "#0d1824",
        line: "#1f3347",
        cyan: "#f2eadc",
        ember: "#f97316",
        gold: "#f6c453"
      },
      boxShadow: {
        glow: "0 20px 60px rgba(242, 234, 220, 0.16)"
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at top left, rgba(242,234,220,0.12), transparent 30%), radial-gradient(circle at top right, rgba(249,115,22,0.10), transparent 28%), linear-gradient(180deg, rgba(11,13,18,1), rgba(18,21,29,1))"
      }
    }
  },
  plugins: []
};

export default config;
