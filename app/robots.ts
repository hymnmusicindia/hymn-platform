import type { MetadataRoute } from "next";
import { getPublicAppUrl } from "@/lib/public-app-url";

export default function robots(): MetadataRoute.Robots {
  const origin = getPublicAppUrl();
  return {
    rules: [
      // Let crawlers see noindex on account/sign-in pages. Authentication still
      // protects their content. Only explicitly public image APIs are crawlable.
      { userAgent: "*", allow: ["/", "/api/image-preview", "/api/public-uploads/"], disallow: ["/api/", "/_next/webpack-hmr"] }
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin
  };
}
