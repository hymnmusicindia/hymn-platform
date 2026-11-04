const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const suites = ['performance-execution','first-release','direnote-contract','producer-lifecycle','analytics','migration-safety','razorpay','subscriptions','payment-enforcement','storage','release-status','distribution-idempotency','payout','managed-services','studio-services','distribution-pricing'];
// These suites import server-only business modules. The condition must reach
// each child process, rather than only the npm process that starts the suite.
const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --conditions=react-server`.trim(), EMAIL_ENABLED: 'false', HYMN_CRON_WORKER_ENABLED: 'false' };
const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
if (!fs.existsSync(npmCli)) throw Error('Run the regression suite through npm test.');
(async () => {
  for (const suite of suites) {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [npmCli, 'run', `test:${suite}`], { env, stdio: 'inherit', windowsHide: true });
      child.on('error', reject); child.on('exit', code => resolve(code ?? 1));
    });
    if (code !== 0) { process.exitCode = code; return; }
  }
  for (const script of ['verify-request-boundaries.ts', 'verify-draft-request-boundaries.ts', 'verify-validator-update-semantics.ts', 'verify-music-phone-notifications.ts']) {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', `scripts/${script}`], { env, stdio: 'inherit', windowsHide: true });
      child.on('error', reject); child.on('exit', code => resolve(code ?? 1));
    });
    if (code !== 0) { process.exitCode = code; return; }
  }
  console.log(`PASS all ${suites.length} core regression groups and request/update boundary regressions.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
