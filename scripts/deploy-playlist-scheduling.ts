import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'dotenv';
import { spawnSync } from 'node:child_process';
Object.assign(process.env, parse(readFileSync('.env.hostinger')));
async function main() {
  const { PrismaClient } = await import('@prisma/client'); const db = new PrismaClient();
  const { assertProductionDatabaseReady } = await import('../lib/production-database-safety');
  try {
    await assertProductionDatabaseReady(db);
    const applied = await db.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const pending = readdirSync('prisma/migrations', { withFileTypes: true }).filter(row => row.isDirectory() && !applied.some(a => a.migration_name === row.name)).map(row => row.name);
    console.log(JSON.stringify({ pending }));
    if (!process.argv.includes('--apply') || !pending.length) return;
    if (pending.length !== 1 || pending[0] !== '20261015023000_playlist_release_scheduling') throw Error('Unexpected pending migrations; refusing deployment.');
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/deploy-production-migrations.ts'], { stdio: 'inherit', env: process.env, windowsHide: true });
    if (result.status !== 0) throw Error('Scheduling migration failed.');
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[REDACTED]') : 'Deployment failed'); process.exitCode = 1; });
