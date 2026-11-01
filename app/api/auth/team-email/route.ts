import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { isSameAppOrigin } from "@/lib/request-origin";
import { requestIdentity } from "@/lib/rate-limit";
import { apiRequestId } from "@/lib/api-response";
import { createSession } from "@/lib/session";
import type { UserRole } from "@/lib/types";
import { getEmailConfig } from "@/lib/email/email-client";
import { requestTeamEmailCode, verifyTeamEmailCode, TeamEmailSignInError } from "@/lib/team/email-sign-in";

export const runtime = "nodejs";
export const maxDuration = 30;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const email = z.string().trim().toLowerCase().email().max(254);
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), email }).strict(),
  z.object({ action: z.literal("verify"), email, challenge: z.string().min(1).max(2000), code: z.string().regex(/^\d{6}$/) }).strict()
]);
export async function GET() { return NextResponse.json({ teamEmailSignIn: "v1", available: getEmailConfig().enabled }, { headers }); }
export async function POST(request: Request) {
  try {
    if (!isSameAppOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403, headers });
    if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON content required." }, { status: 415, headers });
    if (Number(request.headers.get("content-length") || 0) > 4096) return NextResponse.json({ error: "Request too large." }, { status: 413, headers });
    const text = await request.text();
    if (text.length > 4096) return NextResponse.json({ error: "Request too large." }, { status: 413, headers });
    let body: unknown; try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400, headers }); }
    const payload = input.parse(body), ipAddress = requestIdentity(request);
    if (payload.action === "request") {
      if (!getEmailConfig().enabled) return NextResponse.json({ error: "Email sign-in is temporarily unavailable. Please try again later." }, { status: 503, headers });
      return NextResponse.json(await requestTeamEmailCode(payload.email, ipAddress), { status: 202, headers });
    }
    const user = await verifyTeamEmailCode(payload.email, payload.challenge, payload.code, ipAddress);
    await createSession({ sub: user.id, email: user.email, name: user.name, role: user.role.toLowerCase() as UserRole, avatarUrl: user.avatar }, { ipAddress, userAgent: request.headers.get("user-agent")?.slice(0, 1000), requestId: apiRequestId(request) });
    return NextResponse.json({ signedIn: true }, { headers });
  } catch (error) {
    if (error instanceof TeamEmailSignInError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { ...headers, ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) } });
    if (error instanceof ZodError) return NextResponse.json({ error: "Enter a valid team email and six-digit code." }, { status: 400, headers });
    console.error("TEAM_EMAIL_SIGN_IN_UNAVAILABLE");
    return NextResponse.json({ error: "Sign-in is temporarily unavailable. Please try again." }, { status: 503, headers });
  }
}
