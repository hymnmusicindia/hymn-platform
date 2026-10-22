import { PrismaClient } from '@prisma/client';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { assertProductionDatabaseReady } from '../lib/production-database-safety';

const migration = '20261022150000_release_artist_verification';
async function main() {
  const db = new PrismaClient();
  try {
    await assertProductionDatabaseReady(db, { enforceRestrictedRole: false });
    const applied = await db.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`;
    if (applied.some(row => !row.finished_at && !row.rolled_back_at)) throw Error('An incomplete migration needs inspection first.');
    const pending = readdirSync('prisma/migrations', { withFileTypes: true }).filter(entry => entry.isDirectory() && !applied.some(row => row.migration_name === entry.name && row.finished_at && !row.rolled_back_at)).map(entry => entry.name);
    if (pending.some(name => name !== migration)) throw Error('Unexpected pending migrations; refusing this targeted deployment.');
    console.log(JSON.stringify({ pending }));
    if (pending.length && process.argv.includes('--apply')) {
      const [owner] = await db.$queryRaw<{ ddl: boolean; foreignTables: bigint }[]>`SELECT has_schema_privilege(current_user,'public','CREATE') AS ddl,(SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tableowner<>current_user) AS "foreignTables"`;
      if (!owner?.ddl || owner.foreignTables !== 0n) throw Error('The verified canonical database owner is required.');
      const snapshot = await db.$transaction(async tx => ({
        artists: await tx.artistCard.findMany(),
        releases: await tx.release.findMany({ select: { id: true, userId: true, artistProfileId: true, status: true } }),
        tracks: await tx.track.findMany({ select: { id: true, releaseId: true, metadata: true } }),
        migrations: applied
      }), { isolationLevel: 'RepeatableRead', timeout: 60000 });
      const bytes = Buffer.from(JSON.stringify(snapshot));
      const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');
      const file = path.resolve('.cache/backups', `artist-verification-${Date.now()}.json.gz`);
      mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, gzipSync(bytes), { mode: 0o600 });
      if (digest(gunzipSync(readFileSync(file))) !== digest(bytes)) throw Error('Snapshot verification failed.');
      console.log(`Verified artist-mapping snapshot: ${file}`);
      const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/deploy-production-migrations.ts'], { windowsHide: true, stdio: 'inherit', env: { ...process.env, MIGRATION_DATABASE_URL: process.env.DATABASE_URL } });
      if (result.status !== 0) throw Error('Migration deployment failed.');
    } else if (pending.length) return;
    await db.releaseArtistIdentity.findFirst({ include: { artistCard: { select: { id: true } }, release: { select: { id: true } } } });
    console.log('Artist verification table and relations are ready. No artist or release mappings were modified.');
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[REDACTED]') : 'Artist verification migration failed.'); process.exitCode = 1; });
