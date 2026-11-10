import { publicMcpServerCard } from "@/lib/public-agent-tools";
import { getPublicAppUrl } from "@/lib/public-app-url";

export function GET() {
  return Response.json(publicMcpServerCard(getPublicAppUrl()), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } });
}
export function OPTIONS() { return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS" } }); }
