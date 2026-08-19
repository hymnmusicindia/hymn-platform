import type { UserRole } from "@/lib/types";

export function profileAvatarDataUrl(name: string, role: UserRole | "google" = "customer") {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "HY";
  const accent = role === "producer" ? "#f5c16c" : role === "google" ? "#ffffff" : "#7db7ff";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${accent}"/><stop offset="1" stop-color="#f4f7fb"/></linearGradient></defs><rect width="160" height="160" rx="80" fill="url(#g)"/><circle cx="80" cy="62" r="28" fill="#090b10" opacity="0.84"/><path d="M35 142c7-34 22-51 45-51s38 17 45 51" fill="#090b10" opacity="0.84"/><text x="80" y="145" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
