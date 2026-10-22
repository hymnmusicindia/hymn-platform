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
  const identityColumns = await db.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'release_artist_identities'
  `;
  const present = new Set(identityColumns.map(column => column.column_name));
  const missingIdentity = ['id', 'release_id', 'artist_card_id', 'artist_name', 'spotify_url', 'apple_url', 'youtube_url', 'instagram_url', 'provider_artist_id', 'previous_provider_artist_id', 'source_fingerprint', 'selection_hash', 'confirmed_at', 'confirmed_by', 'opened_spotify_url', 'corrected', 'created_at', 'updated_at'].filter(column => !present.has(column));
  if (missingIdentity.length) throw new Error(`Artist verification migration required: missing release_artist_identities columns: ${missingIdentity.join(', ')}. Apply production migrations before deploying this application.`);
}
