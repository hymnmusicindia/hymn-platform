import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const fixture = mkdtempSync(path.join(os.tmpdir(), 'hymn-artist-hub-'));
const port = 55461, databaseDir = path.join(fixture, 'pg');
const environment = { ...process.env, DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/artist_hub_fixture`, DIRECT_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/artist_hub_fixture`, EMAIL_ENABLED: 'false', GOOGLE_SHEETS_ENABLED: 'false', GROWTH_ANALYTICS_ENABLED: 'false', HYMN_CRON_WORKER_ENABLED: 'false', PAYOUT_ENCRYPTION_KEY: 'artist-hub-disposable-fixture-key-at-least-thirty-two-characters' };
const run = (args: string[], executable = process.execPath) => new Promise<void>((resolve, reject) => {
  const child = spawn(executable, args, { env: { ...environment, MINIMUM_PAYOUT_USD: '1', HYMN_STORAGE_ROOT: path.join(fixture, 'storage'), PRIVATE_STORAGE_ROOT: path.join(fixture, 'storage') }, stdio: 'inherit', windowsHide: true });
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(`Fixture command exited ${code}`)));
});
async function main() {
  const pg = new EmbeddedPostgres({ databaseDir, port, user: 'fixture', password: 'fixture', persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'] });
  const baseline = readFileSync('prisma/schema.prisma', 'utf8').replace(/^model (?:ArtistHub\w+|PayoutVerification) \{[\s\S]*?^\}\r?\n/gm, '').replace(/^\s*hubIdentityId\s+Int\?.*\r?\n/gm, '').replace(/^\s*@@index\(\[hubIdentityId\]\).*\r?\n/gm, '');
  const schema = path.join(fixture, 'baseline.prisma'); writeFileSync(schema, baseline);
  await pg.initialise(); await pg.start();
  try {
    await pg.createDatabase('artist_hub_fixture');
    await run(['node_modules/prisma/build/index.js', 'db', 'push', '--schema', schema, '--skip-generate']);
    await run(['node_modules/prisma/build/index.js', 'db', 'execute', '--file', 'prisma/migrations/20261112120000_artist_hub/migration.sql', '--schema', 'prisma/schema.prisma']);
    for (const script of ['verify-artist-hub-integration.ts', 'verify-payout-kyc-integration.ts']) await run(['--conditions=react-server', '--import', 'tsx', `scripts/${script}`]);
    if (process.argv.includes('--build')) await run(['scripts/verify-artist-profiles-build.cjs']);
  } finally {
    if (process.platform === 'win32') await run(['-D', databaseDir, '-m', 'fast', '-w', 'stop'], path.resolve('node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'));
    else await pg.stop();
    console.log(`Disposable Artist Hub fixture retained at ${fixture}. No production data or delivery was used.`);
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
