export type ThemeMode = "light" | "dark";

export function applyDocumentTheme(theme: ThemeMode, persist = true) {
  const scheme = `only ${theme}`;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = scheme;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", scheme);
  if (persist) {
    try { localStorage.setItem("hymn-theme", theme); } catch { /* The current tab still supports switching with storage disabled. */ }
  }
}
