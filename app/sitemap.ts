import type { MetadataRoute } from "next";
import { getPublicAppUrl } from "@/lib/public-app-url";

const routes = [
  ["", 1, "daily"],
  ["/distribution", 0.95, "weekly"],
  ["/beat-store", 0.95, "daily"],
  ["/studio", 0.9, "weekly"],
  ["/services", 0.85, "monthly"],
  ["/about", 0.75, "monthly"],
  ["/mission", 0.75, "monthly"],
  ["/partnership-program", 0.7, "monthly"],
  ["/faq", 0.7, "monthly"],
  ["/contact", 0.65, "monthly"],
  ["/policies", 0.5, "monthly"],
  ["/privacy-policy", 0.35, "yearly"],
  ["/terms-of-service", 0.35, "yearly"]
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getPublicAppUrl();
  return routes.map(([path, priority, changeFrequency]) => ({ url: `${origin}${path}`, lastModified: new Date("2026-09-30"), changeFrequency, priority }));
}
