import type { PrismaClient } from "@prisma/client";

export async function assertTeamSchemaReady(db: PrismaClient) {
  const columns = await db.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'acquisition_leads'
  `;
  const present = new Set(columns.map(column => column.column_name));
  const missing = ["referral_history", "requires_referral_consent", "referral_accepted_at", "referral_ended_at", "referral_only"].filter(column => !present.has(column));
  if (missing.length) throw new Error(`Team Workspace migration required: missing acquisition_leads columns: ${missing.join(", ")}. Apply production migrations before deploying this application.`);
  // Probe the fields used by workspace reads, including the optional Calendar
  // integration. No customer data or OAuth tokens are selected.
  try {
    await db.teamTask.findFirst({ select: { callPhase: true, callAttempts: true, conversationCount: true } });
    await db.teamCalendarEvent.findFirst({ select: { googleSyncStatus: true, googleMeetUrl: true, googleCalendarUrl: true, googleEventId: true, googleSyncAfter: true, googleSyncAttempts: true, googleSyncError: true, googleSyncLease: true, googleSyncedRevision: true } });
    await db.consultationRequest.findFirst({ select: { taskId: true, version: true } });
    await db.teamGoogleCalendar.count();
    await db.teamWorkHandoff.count();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && ["P2021", "P2022"].includes(String(error.code))) {
      throw new Error("Team Workspace migration required: apply 20261110190000_unified_customer_calls before serving this application.");
    }
    throw error;
  }
}
