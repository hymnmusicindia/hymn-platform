import type { MetadataRoute } from "next";
import { getPublicAppUrl } from "@/lib/public-app-url";

export default function robots(): MetadataRoute.Robots {
  const origin = getPublicAppUrl();
  return {
    rules: [
      { userAgent: "*", allow: ["/", "/about", "/beat-store", "/contact", "/distribution", "/faq", "/mission", "/partnership-program", "/policies", "/services", "/studio"], disallow: ["/admin/", "/api/", "/dashboard/", "/producer/dashboard/", "/checkout/", "/auth/"] },
      { userAgent: "Googlebot-Image", allow: ["/favicon.png", "/apple-touch-icon.png", "/icon-512.png", "/assets/"] }
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin
  };
}
