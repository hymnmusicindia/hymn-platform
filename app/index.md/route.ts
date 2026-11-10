import { homeMarkdown } from "@/lib/public-agent-content";
import { getPublicAppUrl } from "@/lib/public-app-url";

export function GET() {
  const origin = getPublicAppUrl();
  return new Response(homeMarkdown(origin), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=300", "Vary": "Accept", "Link": `<${origin}/>; rel="canonical"` } });
}
