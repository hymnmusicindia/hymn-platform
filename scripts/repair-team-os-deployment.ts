import { PrismaClient } from '@prisma/client';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { assertProductionDatabaseReady } from '../lib/production-database-safety';

const expected = ['20261019150000_acquisition_payout_cancellation', '20261022090000_shared_contacts_followups', '20261026110000_referral_consent_and_effective_periods'];
const tables = ['team_workspaces', 'team_tasks', 'team_prospects', 'team_clients', 'acquisition_payouts', 'acquisition_payout_items', 'acquisition_payout_payments', 'acquisition_commissions', 'acquisition_revenue_evidence', 'referrals', 'acquisition_leads', 'referral_mail_jobs'];
async function main() {
  await assertProductionDatabaseReady(undefined, { enforceRestrictedRole: false });
  const db = new PrismaClient();
  try {
    const pending = await db.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`;
    if (pending.length) throw Error('A migration is already incomplete; inspect it before recovery.');
    const applied = await db.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const missing = expected.filter(name => !applied.some(row => row.migration_name === name));
    const unreviewed = readdirSync('prisma/migrations', { withFileTypes: true }).filter(entry => entry.isDirectory() && !applied.some(row => row.migration_name === entry.name) && !expected.includes(entry.name));
    if (unreviewed.length) throw Error('Unexpected pending migrations; refusing targeted recovery.');
    console.log(JSON.stringify({ missing }));
    if (!process.argv.includes('--apply') || !missing.length) return;
    const [owner] = await db.$queryRaw<{ ddl: boolean; foreignTables: bigint }[]>`SELECT has_schema_privilege(current_user,'public','CREATE') AS ddl,(SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tableowner<>current_user) AS "foreignTables"`;
    if (!owner?.ddl || owner.foreignTables !== 0n) throw Error('Recovery requires the verified canonical database owner credential.');
    // These migrations retain business rows. Keep a local, verified snapshot of
    // every affected existing table before changing schema or payout guards.
    const snapshot = await db.$transaction(async tx => {
      const result: Record<string, unknown[]> = {};
      for (const table of tables) result[table] = await tx.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${table}" t`);
      return result;
    }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
    const folder = path.resolve('.cache'); mkdirSync(folder, { recursive: true });
    const file = path.join(folder, `team-os-recovery-${Date.now()}.json.gz`);
    writeFileSync(file, gzipSync(JSON.stringify(snapshot)), { mode: 0o600 });
    const verified = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
    for (const table of tables) if (verified[table].length !== snapshot[table].length) throw Error('Snapshot verification failed.');
    console.log(`Verified local snapshot: ${file}`);
    // The runtime credential has just been verified as the canonical owner.
    // Do not let stale aliases point the migration runner at another database.
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/deploy-production-migrations.ts'], { stdio: 'inherit', windowsHide: true, env: { ...process.env, MIGRATION_DATABASE_URL: process.env.DATABASE_URL } });
    if (result.status !== 0) throw Error('Migration deployment failed; no application retry was attempted.');
    await db.teamWorkspace.findFirst({ select: { id: true, customerFollowupCursor: true } });
    await db.teamTask.findFirst({ select: { id: true, clientId: true, followUpContext: true } });
    await db.teamProspect.findFirst({ select: { id: true, clientId: true } });
    await db.acquisitionPayoutCancellation.count();
    await db.acquisitionLead.findFirst({ select: { id: true, referralHistory: true, requiresReferralConsent: true, referralAcceptedAt: true, referralEndedAt: true, referralOnly: true } });
    console.log('Team OS schema queries passed. No customer messages or jobs were executed.');
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[REDACTED]') : 'Team OS recovery failed.'); process.exitCode = 1; });
