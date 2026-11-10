import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { teamActor } from "@/lib/team/access";
import { calendarOAuthClient } from "@/lib/team/google-calendar";
import { isSameAppOrigin } from "@/lib/request-origin";

export async function POST(request: Request) {
  if (!isSameAppOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return NextResponse.json({ error: "Use the calendar connection form." }, { status: 415 });
  if (Number(request.headers.get("content-length") || 0) > 8192) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  try {
    const body = await request.text();
    if (body.length > 8192) return NextResponse.json({ error: "Request too large." }, { status: 413 });
    const form = new URLSearchParams(body), actor = await teamActor(String(form.get("workspace") || ""));
    if (!actor.role.owner) return NextResponse.json({ error: "Only the workspace owner can connect its hosting calendar." }, { status: 403 });
    const client = calendarOAuthClient(), nonce = randomBytes(32).toString("base64url");
    const state = jwt.sign({ purpose: "team-calendar", workspaceId: actor.workspaceId, memberId: actor.id, userId: actor.userId, nonce }, process.env.JWT_SECRET!, { expiresIn: "10m", algorithm: "HS256" });
    (await cookies()).set("hymn-calendar-state", nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/team/google-calendar", maxAge: 600 });
    return NextResponse.redirect(client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: ["openid", "email", "https://www.googleapis.com/auth/calendar.events"], state }), 303);
  } catch { return NextResponse.json({ error: "Configure Google Calendar OAuth credentials and calendar token encryption before connecting." }, { status: 503 }); }
}
