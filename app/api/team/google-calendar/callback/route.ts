import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { teamActor } from "@/lib/team/access";
import { teamWrite } from "@/lib/team/service";
import { TeamError } from "@/lib/team/policy";
import { calendarOAuthClient, encryptCalendarToken, syncGoogleCalendar } from "@/lib/team/google-calendar";
import { getPublicAppUrl } from "@/lib/public-app-url";

export async function GET(request: Request) {
  const jar = await cookies();
  try {
    const params = new URL(request.url).searchParams;
    const state = jwt.verify(params.get("state") || "", process.env.JWT_SECRET!, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    const nonce = jar.get("hymn-calendar-state")?.value;
    jar.set("hymn-calendar-state", "", { path: "/api/team/google-calendar", maxAge: 0 });
    if (state.purpose !== "team-calendar" || !nonce || state.nonce !== nonce || !params.get("code") || params.has("error")) throw Error("Invalid authorization.");
    const actor = await teamActor(state.workspaceId);
    if (!actor.role.owner || actor.id !== state.memberId || actor.userId !== state.userId) throw Error("Authorization changed.");
    const client = calendarOAuthClient(), { tokens } = await client.getToken(params.get("code")!);
    if (!tokens.id_token || !tokens.scope?.split(" ").includes("https://www.googleapis.com/auth/calendar.events")) throw Error("Calendar access was not granted.");
    const profile = (await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID })).getPayload();
    if (!profile?.email || profile.email_verified !== true) throw Error("A verified Google account is required.");
    await teamWrite(actor, async (tx, a) => {
      if (!a.role.owner) throw new TeamError("Owner access required.", 403);
      const previous = await tx.teamGoogleCalendar.findUnique({ where: { workspaceId: a.workspaceId } });
      if (previous && previous.accountEmail !== profile.email && await tx.teamCalendarEvent.count({ where: { workspaceId: a.workspaceId, googleEventId: { not: null } } })) throw new TeamError("Reconnect the original hosting account to retain existing events.", 409);
      const encrypted = tokens.refresh_token ? encryptCalendarToken(tokens.refresh_token) : previous && previous.accountEmail === profile.email ? previous.refreshTokenEncrypted : null;
      if (!encrypted) throw new TeamError("Reconnect and grant offline calendar access.");
      const data = { accountEmail: profile.email!, refreshTokenEncrypted: encrypted, connectedById: a.id, connectedAt: new Date() };
      await tx.teamGoogleCalendar.upsert({ where: { workspaceId: a.workspaceId }, create: { workspaceId: a.workspaceId, ...data }, update: data });
      await tx.teamCalendarEvent.updateMany({ where: { workspaceId: a.workspaceId, googleSyncStatus: { in: ["WAITING_CONNECTION", "ERROR", "RETRY"] } }, data: { googleSyncStatus: "PENDING", googleSyncAfter: null, googleSyncAttempts: 0, version: { increment: 1 } } });
    });
    after(() => syncGoogleCalendar(actor.workspaceId).then(() => undefined));
    return NextResponse.redirect(`${getPublicAppUrl()}/team?workspace=${encodeURIComponent(actor.workspaceId)}&module=team-queue&calendar=connected`, 303);
  } catch {
    jar.set("hymn-calendar-state", "", { path: "/api/team/google-calendar", maxAge: 0 });
    return NextResponse.json({ error: "Google Calendar could not be connected. Retry using the hosting Google account, grant Calendar access, and keep your owner session signed in." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
