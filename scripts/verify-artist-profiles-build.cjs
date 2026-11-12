// Run only through the disposable Artist profiles fixture. Keep local editor config intact.
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const database = new URL(process.env.DATABASE_URL || 'http://invalid');
if (!['127.0.0.1', 'localhost'].includes(database.hostname) || database.pathname !== '/artist_hub_fixture') throw Error('This build helper requires the disposable Artist profiles database.');
const originalNext = fs.readFileSync('next.config.ts', 'utf8');
const originalTs = fs.readFileSync('tsconfig.json', 'utf8');
const originalNextEnv = fs.readFileSync('next-env.d.ts', 'utf8');
fs.mkdirSync('.cache', { recursive: true });
const sourceTs = { extends: '../tsconfig.json', compilerOptions: { incremental: false }, include: ['../app/**/*.ts', '../app/**/*.tsx', '../components/**/*.ts', '../components/**/*.tsx', '../lib/**/*.ts', '../lib/**/*.tsx', '../next-env.d.ts', '../.next-artist-profiles-check/types/**/*.ts'], exclude: ['../node_modules'] };
fs.writeFileSync('.cache/artist-profiles-build-tsconfig.json', JSON.stringify(sourceTs, null, 2));
fs.writeFileSync('next.config.ts', originalNext.replace('const nextConfig: NextConfig = {', 'const nextConfig: NextConfig = {\n  typescript: { tsconfigPath: ".cache/artist-profiles-build-tsconfig.json" },'));
function restore() { fs.writeFileSync('next.config.ts', originalNext); fs.writeFileSync('tsconfig.json', originalTs); fs.writeFileSync('next-env.d.ts', originalNextEnv); }
const child = cp.spawn(process.execPath, ['--max-old-space-size=8192', path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'build', '--webpack'], { stdio: 'inherit', windowsHide: true, env: { ...process.env, NEXT_DIST_DIR: '.next-artist-profiles-check', HYMN_BUILD_DISABLE_CACHE: 'true', HYMN_CRON_WORKER_ENABLED: 'false' } });
child.on('error', cause => { restore(); console.error(cause); process.exitCode = 1; });
child.on('exit', code => { restore(); process.exitCode = code || 0; });
