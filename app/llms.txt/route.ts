import { llmsText } from "@/lib/public-agent-content";
import { getPublicAppUrl } from "@/lib/public-app-url";

export function GET() {
  return new Response(llmsText(getPublicAppUrl()), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
