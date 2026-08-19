"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type ThemeMode = "dark" | "light";

function getSystemTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeMode, persist = true) {
  document.documentElement.dataset.theme = theme;
  if (persist) {
    localStorage.setItem("hymn-theme", theme);
  }
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("hymn-theme");
    const nextTheme: ThemeMode = stored === "light" || stored === "dark" ? stored : getSystemTheme();
    setTheme(nextTheme);
    applyTheme(nextTheme, stored === "light" || stored === "dark");
    setReady(true);

    if (stored === "light" || stored === "dark") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      const systemTheme: ThemeMode = event.matches ? "dark" : "light";
      setTheme(systemTheme);
      applyTheme(systemTheme, false);
    };

    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      aria-pressed={theme === "dark"}
      onClick={toggleTheme}
      className={compact ? "btn-outline w-full gap-3" : "inline-flex h-11 w-11 items-center justify-center rounded-lg border"}
      style={compact ? undefined : { borderColor: "var(--border-strong)", background: "var(--card)", color: "var(--text)" }}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {compact && ready ? <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span> : null}
    </button>
  );
}
