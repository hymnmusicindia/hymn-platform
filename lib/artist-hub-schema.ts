import type { PrismaClient } from '@prisma/client';
export async function assertArtistHubSchemaReady(db: PrismaClient) {
  const required: Record<string, string[]> = {
    artist_cards: ['hub_identity_id'], artist_hub_identities: ['source_card_id', 'owner_user_id', 'spotify_id', 'apple_id'],
    artist_hub_participations: ['release_id', 'recipient_user_id', 'revision', 'status', 'intervention'],
    artist_hub_cases: ['event_key', 'identity_id', 'requester_user_id', 'status'], artist_hub_endorsements: ['identity_id', 'user_id', 'active'],
    artist_hub_mail: ['event_key', 'status', 'attempts', 'next_attempt_at'], payout_verifications: ['user_id', 'identity_asset_id', 'beneficiary_asset_id', 'consent_at', 'credential_updated_at'],
  };
  const columns = await db.$queryRaw<Array<{ table_name: string; column_name: string }>>`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`;
  const present = new Set(columns.map(row => `${row.table_name}.${row.column_name}`));
  const missing = Object.entries(required).flatMap(([table, names]) => names.filter(name => !present.has(`${table}.${name}`)).map(name => `${table}.${name}`));
  if (missing.length) throw Error(`Artist profile migration required: apply 20261112120000_artist_hub before deploying this application. Missing: ${missing.join(', ')}.`);
}
