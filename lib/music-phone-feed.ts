import { customerBrandText } from "@/lib/customer-message";

export function phoneFeedCursor(value: string | null): number | null {
  if (value === null) return null;
  if (!/^(0|[1-9]\d{0,9})$/.test(value)) throw new Error("Invalid notification cursor.");
  const id = Number(value);
  if (id > 2147483647) throw new Error("Invalid notification cursor.");
  return id;
}

export function phoneNotificationHref(value: string | null): string {
  try {
    const url = new URL(value || "/dashboard", "https://hymnmusic.fun");
    if (url.origin !== "https://hymnmusic.fun" || url.username || url.password || /[\\\r\n]/.test(value || "")) return "/dashboard";
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth")) return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch { return "/dashboard"; }
}

export function phoneNotification(item: { id: number; title: string; type: string; href: string | null }) {
  return { id: item.id, title: customerBrandText(item.title).slice(0, 160), type: item.type, href: phoneNotificationHref(item.href) };
}
