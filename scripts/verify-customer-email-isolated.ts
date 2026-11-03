import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
mkdirSync('.cache', { recursive: true });
const fixture = mkdtempSync(path.resolve('.cache/customer-email-')), databaseDir = path.join(fixture, 'pg');
const env = { ...process.env, DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:55488/customer_email_fixture', DIRECT_URL: 'postgresql://fixture:fixture@127.0.0.1:55488/customer_email_fixture', JWT_SECRET: 'customer-email-isolated-test-only', EMAIL_ENABLED: 'false', NODE_ENV: 'test', TEMP: fixture, TMP: fixture };
const run = (args: string[], executable = process.execPath) => new Promise<void>((resolve, reject) => { const child = spawn(executable, args, { env, stdio: 'inherit', windowsHide: true }); child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(`Fixture command exited ${code}`))); });
async function main() {
  const pg = new EmbeddedPostgres({ databaseDir, port: 55488, user: 'fixture', password: 'fixture', persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'] });
  await pg.initialise(); await pg.start();
  try { await pg.createDatabase('customer_email_fixture'); await run(['node_modules/prisma/build/index.js', 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate']); await run(['--conditions=react-server', '--import', 'tsx', 'scripts/verify-customer-email.ts']); }
  finally { if (process.platform === 'win32') await run(['-D', databaseDir, '-m', 'fast', '-w', 'stop'], path.resolve('node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe')); else await pg.stop(); }
}
main().then(() => process.exit(0)).catch(() => { console.error('Customer email fixture failed; production was not used.'); process.exit(1); });
