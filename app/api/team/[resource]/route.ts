import { isSameAppOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { teamActor, teamIdentity } from "@/lib/team/access";
import { TeamError } from "@/lib/team/policy";
import { teamMutation, teamRead, acceptTeamInvitation } from "@/lib/team/service";
import { consumeRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function failure(error: unknown) {
  if (error instanceof TeamError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400, headers });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "This record already exists. Refresh before trying again." }, { status: 409, headers });
  return NextResponse.json({ error: "Team Workspace is temporarily unavailable. Please try again." }, { status: 503, headers });
}
type Context = { params: Promise<{ resource: string }> };
export async function GET(request: Request, context: Context) {
  try { const url = new URL(request.url); const a = await teamActor(url.searchParams.get("workspace") || undefined); const { resource } = await context.params; return NextResponse.json(await teamRead(a, resource, url.searchParams), { headers }); } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    // Session cookies are SameSite=Lax; additionally require same-origin browser
    // writes. Never trust a client-supplied role/member identity.
    if (!isSameAppOrigin(request)) throw new TeamError("Same-origin request required.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new TeamError("JSON content required.", 415);
    if (Number(request.headers.get("content-length") || 0) > 256000) throw new TeamError("Request too large.", 413);
    const text = await request.text(); if (text.length > 256000) throw new TeamError("Request too large.", 413);
    let body: unknown; try { body = JSON.parse(text); } catch { throw new TeamError("Invalid JSON."); }
    const user = await teamIdentity();
    const limit = await consumeRateLimit({ scope: "team-write", identity: String(user.id), limit: 90, windowSeconds: 60 });
    if (!limit.allowed) throw new TeamError("Too many changes. Try again shortly.", 429);
    const { resource } = await context.params;
    const result = resource === "accept" ? await acceptTeamInvitation(user, typeof (body as { token?: unknown })?.token === "string" ? (body as { token: string }).token : "") : await teamMutation(await teamActor(new URL(request.url).searchParams.get("workspace") || undefined), resource, body);
    return NextResponse.json(result, { headers });
  } catch (error) { return failure(error); }
}
