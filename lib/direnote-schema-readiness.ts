import { PrismaClient } from "@prisma/client";

export const DIRENOTE_ATTEMPT_COLUMNS = [
  "is_current", "upc", "track_identifiers", "provider_status", "last_checked_at",
  "raw_status_payload", "payload_redacted", "payload_diff", "corrections"
] as const;

export async function missingDireNoteColumns(db: PrismaClient) {
  const columns = await db.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'distribution_submission_attempts'
  `;
  const present = new Set(columns.map(column => column.column_name));
  return DIRENOTE_ATTEMPT_COLUMNS.filter(column => !present.has(column));
}

export async function assertDireNoteSchemaReady(db: PrismaClient) {
  const missing = await missingDireNoteColumns(db);
  if (missing.length) throw new Error(`DireNote database migration required: missing distribution_submission_attempts columns: ${missing.join(", ")}. Apply production migrations before deploying this application.`);
}
