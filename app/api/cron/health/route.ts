import { authorizedCron } from "@/lib/cron/runtime";
import { cronHealthResponse } from "@/lib/cron/health";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!authorizedCron(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const result = await cronHealthResponse();
  const body = await result.json();
  return Response.json(body, { status: body.healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
