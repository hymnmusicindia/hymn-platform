import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('.cache/customer-experience'); mkdirSync(root, { recursive: true });
for (const name of ['ready', 'stop']) { const file = path.join(root, name); if (existsSync(file)) unlinkSync(file); }
const fixture = mkdtempSync(path.join(root, 'fixture-'));
const databaseDir = path.join(fixture, 'pg');
const env = { ...process.env, DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:55481/customer_fixture', DIRECT_URL: 'postgresql://fixture:fixture@127.0.0.1:55481/customer_fixture', EMAIL_ENABLED: 'false', HYMN_CRON_WORKER_ENABLED: 'false', CRON_SECRET: '', JWT_SECRET: 'customer-experience-local-fixture-secret', ADMIN_JWT_SECRET: 'customer-experience-local-admin-secret', NEXT_DIST_DIR: '.next-customer-experience', APP_URL: 'http://127.0.0.1:35510', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:35510', CANONICAL_HOST: '127.0.0.1', RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', RAZORPAY_WEBHOOK_SECRET: '', DIRENOTE_ENABLED: 'false', DIRENOTE_CLIENT_ID: '', DIRENOTE_PIN: '', PRIVATE_STORAGE_ROOT: path.join(fixture, 'private'), HYMN_STORAGE_ROOT: '', HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', NO_PROXY: '127.0.0.1,localhost' };
const run = (args: string[]) => new Promise<void>((resolve, reject) => { const child = spawn(process.execPath, args, { env, stdio: 'inherit', windowsHide: true }); child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(`Customer fixture command exited ${code}`))); });
async function main() {
  const pg = new EmbeddedPostgres({ databaseDir, port: 55481, user: 'fixture', password: 'fixture', persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'] });
  await pg.initialise(); await pg.start();
  let server: ReturnType<typeof spawn> | undefined;
  try {
    await pg.createDatabase('customer_fixture');
    await run(['node_modules/prisma/build/index.js', 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate']);
    await run(['--conditions=react-server', '--import', 'tsx', 'scripts/fixtures/customer-experience.ts']);
    const log = await import('node:fs').then(fs => fs.openSync(path.join(root, 'server.log'), 'w'));
    const heap = process.env.CUSTOMER_AUDIT_HEAP_MB || '4096';
    if (!/^\d{4,5}$/.test(heap)) throw Error('Choose a valid development heap size.');
    server = spawn(process.execPath, [`--max-old-space-size=${heap}`, 'node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '35510'], { env: { ...env, NODE_OPTIONS: `--max-old-space-size=${heap}` }, stdio: ['ignore', log, log], windowsHide: true });
    for (let i = 0; i < 150; i++) { if (server.exitCode !== null) throw Error('Customer audit server exited.'); try { if ((await fetch(`${env.APP_URL}/api/workspaces`)).status === 401) break; } catch {} if (i === 149) throw Error('Customer audit server unavailable.'); await new Promise(resolve => setTimeout(resolve, 1000)); }
    console.log('Customer audit server ready at http://127.0.0.1:35510. Fixture data only; external delivery and payments disabled.');
    if (process.argv.includes('--serve')) { writeFileSync(path.join(root, 'ready'), fixture); while (!existsSync(path.join(root, 'stop'))) { if (server.exitCode !== null) throw Error('Customer audit server exited.'); await new Promise(resolve => setTimeout(resolve, 1000)); } }
    else {
      await run(['--import', 'tsx', 'scripts/verify-customer-experience-browser.ts']);
      if (process.argv.includes('--features')) await run(['--import', 'tsx', 'scripts/verify-customer-experience-features.ts']);
    }
  } finally {
    if (server?.pid) {
      if (process.platform === 'win32') await new Promise<void>(resolve => { const child = spawn('taskkill', ['/PID', String(server!.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); child.on('exit', () => resolve()); });
      else server.kill();
    }
    if (process.platform === 'win32') await new Promise<void>(resolve => { const child = spawn(path.resolve('node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'), ['-D', databaseDir, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore', windowsHide: true }); child.on('exit', () => resolve()); });
    else await pg.stop();
    console.log('Customer fixture stopped. Production accounts and records were not used.');
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
