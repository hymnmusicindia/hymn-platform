import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Prisma, TeamCalendarEvent } from "@prisma/client";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/prisma";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { googleEventBody, googleEventId, safeMeetUrl } from "./google-calendar-policy";

function secretKey() {
  const secret = process.env.TEAM_CALENDAR_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw Error("Calendar token encryption is not configured.");
  return createHash("sha256").update(`hymn-calendar:${secret}`).digest();
}
export function encryptCalendarToken(value: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString("base64url")).join(".");
}
function decryptCalendarToken(value: string) {
  const [iv, tag, data] = value.split(".").map(part => Buffer.from(part, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", secretKey(), iv); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}
export function calendarOAuthClient() {
  const id = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw Error("Google Calendar OAuth client is not configured.");
  secretKey();
  return new OAuth2Client(id, secret, `${getPublicAppUrl()}/api/team/google-calendar/callback`);
}
export async function queueGoogleCalendar(tx: Prisma.TransactionClient, event: TeamCalendarEvent) {
  if (event.kind !== "CALL" && !event.googleEventId) return;
  await tx.teamCalendarEvent.update({ where: { id: event.id }, data: { googleSyncStatus: "PENDING", googleSyncError: null, googleSyncAfter: null, googleSyncAttempts: 0 } });
}
class GoogleCalendarError extends Error { constructor(readonly status: number) { super(`Google Calendar returned ${status}.`); } }
async function accessToken(encrypted: string, transport: typeof fetch) {
  const response = await transport("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "", client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "", refresh_token: decryptCalendarToken(encrypted), grant_type: "refresh_token" }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new GoogleCalendarError(response.status);
  const data = await response.json(); if (typeof data.access_token !== "string") throw new GoogleCalendarError(401);
  return data.access_token as string;
}
export async function syncGoogleCalendar(workspaceId?: string, onlyEventId?: string, transport = fetch) {
  const now = new Date(), leaseExpiry = new Date(now.getTime() - 120000);
  const deadline = Date.now() + 40000;
  const tokens = new Map<string, Promise<string>>();
  const events = await prisma.teamCalendarEvent.findMany({ where: { ...(workspaceId ? { workspaceId } : {}), ...(onlyEventId ? { id: onlyEventId } : {}), OR: [{ googleSyncStatus: { in: ["PENDING", "RETRY", "WAITING_CONNECTION"] } }, { googleEventId: { not: null }, googleSyncStatus: "SYNCED", OR: [{ googleSyncedRevision: { lt: prisma.teamCalendarEvent.fields.scheduleRevision } }, { status: { in: ["CANCELLED", "DELETED"] } }, { client: { status: { not: "ACTIVE" } } }] }], AND: [{ OR: [{ googleSyncAfter: null }, { googleSyncAfter: { lte: now } }] }, { OR: [{ googleSyncLease: null }, { googleSyncLease: { lt: leaseExpiry } }] }] }, orderBy: { updatedAt: "asc" }, take: onlyEventId ? 1 : 20 });
  const results: { id: string; status: string }[] = [];
  for (const event of events) {
    if (Date.now() >= deadline) break;
    const lease = new Date();
    if (!(await prisma.teamCalendarEvent.updateMany({ where: { id: event.id, scheduleRevision: event.scheduleRevision, googleSyncStatus: event.googleSyncStatus, googleSyncedRevision: event.googleSyncedRevision, OR: [{ googleSyncLease: null }, { googleSyncLease: { lt: leaseExpiry } }] }, data: { googleSyncLease: lease } })).count) continue;
    try {
      const connection = await prisma.teamGoogleCalendar.findUnique({ where: { workspaceId: event.workspaceId } });
      if (!connection) { await prisma.teamCalendarEvent.updateMany({ where: { id: event.id, googleSyncLease: lease }, data: { googleSyncStatus: "WAITING_CONNECTION", googleSyncError: "An owner must connect Google Calendar.", googleSyncLease: null } }); results.push({ id: event.id, status: "WAITING_CONNECTION" }); continue; }
      const current = await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: event.id }, include: { client: true, assignee: { include: { user: true } }, consultation: true } });
      if (current.scheduleRevision !== event.scheduleRevision) { await prisma.teamCalendarEvent.updateMany({ where: { id: event.id, googleSyncLease: lease }, data: { googleSyncLease: null } }); continue; }
      if (current.status === "COMPLETED") {
        await prisma.teamCalendarEvent.updateMany({ where: { id: event.id, scheduleRevision: event.scheduleRevision, googleSyncLease: lease }, data: { googleSyncStatus: current.googleEventId ? "SYNCED" : "NOT_REQUIRED", googleSyncedRevision: event.scheduleRevision, googleSyncLease: null } });
        continue;
      }
      if (!tokens.has(connection.workspaceId)) tokens.set(connection.workspaceId, accessToken(connection.refreshTokenEncrypted, transport));
      const token = await tokens.get(connection.workspaceId)!;
      const externalId = event.googleEventId || googleEventId(event.id);
      const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events`;
      const endpoint = `${base}/${externalId}`;
      const call = async (url: string, method: string, body?: unknown) => {
        const response = await transport(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
        if (response.status === 403) {
          const data = await response.clone().json().catch(() => null);
          if (data?.error?.errors?.some((item: { reason?: string }) => ["rateLimitExceeded", "userRateLimitExceeded"].includes(item.reason || ""))) throw new GoogleCalendarError(429);
        }
        if (![404, 409, 410].includes(response.status) && !response.ok) throw new GoogleCalendarError(response.status);
        return response;
      };
      const cancel = current.status !== "SCHEDULED" || current.kind !== "CALL" || current.client?.status !== "ACTIVE" || current.assignee.status !== "ACTIVE" || current.assignee.user.status !== "ACTIVE";
      let meet: string | null = null, calendarUrl: string | null = null, pendingConference = false;
      if (cancel) { const response = await call(`${endpoint}?sendUpdates=all`, "DELETE"); if (response.status === 409) throw new GoogleCalendarError(409); }
      else if (current.client) {
        const body = googleEventBody({ ...current, client: current.client }, !current.googleMeetUrl);
        const query = "?conferenceDataVersion=1&sendUpdates=all";
        let response = current.googleEventId ? await call(endpoint + query, "PATCH", body) : await call(base + query, "POST", { id: externalId, ...body });
        if (response.status === 404) response = await call(base + query, "POST", { id: externalId, ...body });
        if (response.status === 409) response = await call(endpoint + query, "PATCH", body);
        if (response.status === 409) throw new GoogleCalendarError(409);
        if (response.status === 410) {
          await prisma.teamCalendarEvent.updateMany({ where: { id: event.id, scheduleRevision: event.scheduleRevision, googleSyncLease: lease }, data: { googleEventId: googleEventId(`${externalId}:${event.scheduleRevision}`), googleMeetUrl: null, googleSyncStatus: "RETRY", googleSyncAfter: new Date(Date.now() + 30000), googleSyncLease: null } });
          continue;
        }
        if (response.status === 404) throw new GoogleCalendarError(404);
        const data = await response.json();
        meet = safeMeetUrl(data.hangoutLink);
        calendarUrl = typeof data.htmlLink === "string" && data.htmlLink.startsWith("https://www.google.com/calendar/") ? data.htmlLink : null;
        pendingConference = !meet && data.conferenceData?.createRequest?.status?.statusCode === "pending";
        if (!meet && !pendingConference) throw new GoogleCalendarError(422);
      }
      const saved = await prisma.teamCalendarEvent.updateMany({ where: { id: event.id, scheduleRevision: event.scheduleRevision, googleSyncLease: lease }, data: { googleEventId: cancel && !event.googleEventId ? null : externalId, googleMeetUrl: cancel ? null : meet, googleCalendarUrl: calendarUrl, googleSyncStatus: pendingConference ? "RETRY" : cancel ? "CANCELLED" : "SYNCED", googleSyncedRevision: event.scheduleRevision, googleSyncLease: null, googleSyncAfter: pendingConference ? new Date(Date.now() + 30000) : null, googleSyncError: null } });
      if (!saved.count) await prisma.teamCalendarEvent.updateMany({ where: { id: event.id, googleSyncLease: lease }, data: { googleSyncLease: null, googleSyncStatus: "PENDING" } });
      results.push({ id: event.id, status: cancel ? "CANCELLED" : pendingConference ? "RETRY" : "SYNCED" });
    } catch (error) {
      const attempts = event.googleSyncAttempts + 1, permanent = error instanceof GoogleCalendarError && [400, 401, 403, 410, 422].includes(error.status);
      const status = permanent || attempts >= 8 ? "ERROR" : "RETRY";
      await prisma.teamCalendarEvent.updateMany({ where: { id: event.id, scheduleRevision: event.scheduleRevision, googleSyncLease: lease }, data: { googleSyncStatus: status, googleSyncAttempts: attempts, googleSyncAfter: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** attempts)), googleSyncLease: null, googleSyncError: permanent ? "Google access or conferencing needs review. Reconnect the hosting account or retry after correcting the event." : "Google Calendar is temporarily unavailable. The booking is saved; synchronization will retry." } });
      await prisma.teamCalendarEvent.updateMany({ where: { id: event.id, googleSyncLease: lease }, data: { googleSyncLease: null } });
      results.push({ id: event.id, status });
    }
  }
  return results;
}
