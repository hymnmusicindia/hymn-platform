import { getPublicAppUrl } from "@/lib/public-app-url";

export function GET() {
  const origin = getPublicAppUrl();
  return new Response(`User-Agent: *\nContent-Signal: search=yes, ai-train=no\nAllow: /\nAllow: /blog\nAllow: /blog/\nAllow: /api/image-preview\nAllow: /api/public-uploads/\nDisallow: /api/\nDisallow: /_next/webpack-hmr\n\nSitemap: ${origin}/sitemap.xml\nHost: ${origin}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
