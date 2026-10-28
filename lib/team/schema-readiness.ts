import type { PrismaClient } from "@prisma/client";

export async function assertTeamSchemaReady(db: PrismaClient) {
  const columns = await db.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'acquisition_leads'
  `;
  const present = new Set(columns.map(column => column.column_name));
  const missing = ["referral_history", "requires_referral_consent", "referral_accepted_at", "referral_ended_at", "referral_only"].filter(column => !present.has(column));
  if (missing.length) throw new Error(`Team Workspace migration required: missing acquisition_leads columns: ${missing.join(", ")}. Apply production migrations before deploying this application.`);
}
