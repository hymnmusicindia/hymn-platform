"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type ThemeMode = "dark" | "light";

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
    const nextTheme: ThemeMode = stored === "light" || stored === "dark" ? stored : "light";
    setTheme(nextTheme);
    applyTheme(nextTheme, stored === "light" || stored === "dark");
    setReady(true);
  }, []);

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <button
      type="button"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={theme === "dark"}
      onClick={toggleTheme}
      className={compact ? "btn-outline w-full gap-3" : "theme-toggle-bare inline-flex h-11 w-11 items-center justify-center bg-transparent text-[var(--text)]"}
    >
      <span className="relative block h-5 w-5" aria-hidden="true">
        <Sun className={`theme-toggle-icon absolute inset-0 h-5 w-5 ${theme === "dark" ? "is-visible" : "is-hidden-sun"}`} />
        <Moon className={`theme-toggle-icon absolute inset-0 h-5 w-5 ${theme === "light" ? "is-visible" : "is-hidden-moon"}`} />
      </span>
      {compact && ready ? <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span> : null}
    </button>
  );
}
