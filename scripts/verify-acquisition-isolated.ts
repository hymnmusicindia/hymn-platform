import EmbeddedPostgres from "embedded-postgres";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

// Keep the disposable PostgreSQL fixture inside the workspace on Windows,
// where the embedded server cannot initialise under the profile temp path.
const tempRoot = process.platform === "win32" ? path.resolve(".cache") : path.resolve(os.tmpdir());
mkdirSync(tempRoot, { recursive: true });
const fixture = mkdtempSync(path.join(tempRoot, "hymn-acquisition-"));
const databaseDir = path.join(fixture, "pg"); const port = 55473;
const env = { ...process.env, DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/acquisition_fixture`, DIRECT_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/acquisition_fixture`, EMAIL_ENABLED: "false", NODE_ENV: "test" };
const run = (args: string[], executable = process.execPath, childEnv = env) => new Promise<void>((resolve, reject) => {
  const child = spawn(executable, args, { env: childEnv, stdio: "inherit", windowsHide: true });
  child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Acquisition fixture command exited ${code}`)));
});

async function main() {
  const oldSchema = path.join(fixture, "baseline.prisma");
  // Build the pre-feature schema from the base revision, then apply the
  // acquisition SQL migration exactly as production would. Using HEAD here
  // includes the feature models and makes the migration create duplicate tables.
  writeFileSync(oldSchema, execFileSync("git", ["show", "83ca6fe86ccb00ed78c9c080413e93284a682e7d:prisma/schema.prisma"], { encoding: "utf8", windowsHide: true }));
  const pg = new EmbeddedPostgres({ databaseDir, port, user: "fixture", password: "fixture", persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] });
  await pg.initialise(); await pg.start();
  try {
    await pg.createDatabase("acquisition_fixture");
    if (process.argv.includes('--staff-qc-only')) {
      await run(['node_modules/prisma/build/index.js', 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate']);
      await run(['--conditions=react-server', '--import', 'tsx', 'scripts/verify-staff-qc.ts'], process.execPath, { ...env, APP_URL: 'https://hymn.fixture', ADMIN_GOOGLE_EMAILS: 'founder@staff.fixture.invalid' });
      return;
    }
    if (process.argv.includes('--contact-merge-only')) {
      const baseline=path.join(fixture,'contact-merge-baseline.prisma');
      writeFileSync(baseline,execFileSync('git',['show','7a8caf1:prisma/schema.prisma'],{encoding:'utf8',windowsHide:true}));
      await run(['node_modules/prisma/build/index.js','db','push','--schema',baseline,'--skip-generate']);
      await run(['node_modules/prisma/build/index.js','db','execute','--file','prisma/migrations/20261023230000_contact_merge_aliases/migration.sql','--schema','prisma/schema.prisma']);
      await run(['node_modules/prisma/build/index.js','migrate','diff','--from-url',env.DATABASE_URL,'--to-schema-datamodel','prisma/schema.prisma','--script','--output',path.join(fixture,'contact-diff.sql')]);
      if(/team_clients/.test(readFileSync(path.join(fixture,'contact-diff.sql'),'utf8')))throw new Error('Contact migration does not match schema.');
      await run(['--conditions=react-server','--import','tsx','scripts/verify-contact-merge.ts'],process.execPath,{...env,JWT_SECRET:'contact-merge-fixture-secret-must-be-long-enough',APP_URL:'https://hymn.fixture'});
      return;
    }
    if (process.argv.includes('--support-only')) {
      const baseline=path.join(fixture,'support-baseline.prisma');
      writeFileSync(baseline,execFileSync('git',['show','269c23f:prisma/schema.prisma'],{encoding:'utf8',windowsHide:true}));
      await run(['node_modules/prisma/build/index.js','db','push','--schema',baseline,'--skip-generate']);
      await run(['node_modules/prisma/build/index.js','db','execute','--file','prisma/migrations/20261023210000_support_callbacks_and_replies/migration.sql','--schema','prisma/schema.prisma']);
      await run(['node_modules/prisma/build/index.js','migrate','diff','--from-url',env.DATABASE_URL,'--to-schema-datamodel','prisma/schema.prisma','--script','--output',path.join(fixture,'support-diff.sql')]);
      if (/support_replies|support_tickets/.test(readFileSync(path.join(fixture,'support-diff.sql'),'utf8'))){console.log(readFileSync(path.join(fixture,'support-diff.sql'),'utf8'));throw new Error('Support migration does not match schema.');}
      await run(['--conditions=react-server','--import','tsx','scripts/verify-support-workflow.ts'],process.execPath,{...env,JWT_SECRET:'support-fixture-secret-must-be-long-enough',APP_URL:'https://hymn.fixture'});
      return;
    }
    if (process.argv.includes('--smart-outreach-only')) {
      const baseline = path.join(fixture, 'smart-outreach-baseline.prisma');
      writeFileSync(baseline, readFileSync('prisma/schema.prisma', 'utf8').replace(/^model TeamOutreach(?:Email|Suppression) \{[\s\S]*?^\}\r?\n/gm, '').replace(/^  followUpTaskId String\? @unique @map\("follow_up_task_id"\)\r?\n/gm, ''));
      await run(['node_modules/prisma/build/index.js','db','push','--schema',baseline,'--skip-generate']);
      await run(['node_modules/prisma/build/index.js','db','execute','--file','prisma/migrations/20261023193000_team_smart_outreach/migration.sql','--schema','prisma/schema.prisma']);
      await run(['node_modules/prisma/build/index.js','migrate','diff','--from-url',env.DATABASE_URL,'--to-schema-datamodel','prisma/schema.prisma','--script','--output',path.join(fixture,'schema-diff.sql')]);
      if (/team_outreach|follow_up_task_id/.test(readFileSync(path.join(fixture,'schema-diff.sql'),'utf8'))) throw new Error('Smart outreach migration does not match its Prisma schema.');
      await run(['--conditions=react-server','--import','tsx','scripts/verify-smart-team-outreach.ts'], process.execPath, { ...env, JWT_SECRET: 'isolated-team-outreach-fixture-secret-must-be-long-enough', APP_URL: 'https://hymn.fixture' });
      return;
    }
    if (process.argv.includes('--review-handoff-only')) {
      await run(['node_modules/prisma/build/index.js','db','push','--skip-generate']);
      await run(['--conditions=react-server','--import','tsx','scripts/verify-review-handoff.ts']);
      return;
    }
    if (process.argv.includes('--amendment-identifiers-only')) {
      await run(['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate']);
      await run(['--conditions=react-server', '--import', 'tsx', 'scripts/verify-amendment-identifiers.ts']);
      await run(['--conditions=react-server', '--import', 'tsx', 'scripts/verify-artist-amendment.ts']);
      await run(['--conditions=react-server', '--import', 'tsx', 'scripts/verify-amendment-feedback.ts']);
      await run(['--conditions=react-server', '--import', 'tsx', 'scripts/verify-automatic-amendment.ts']);
      return;
    }
    if (process.argv.includes("--contacts-followups-only")) {
      writeFileSync(oldSchema, execFileSync("git", ["show", "07ad464:prisma/schema.prisma"], { encoding: "utf8", windowsHide: true }));
      await run(["node_modules/prisma/build/index.js", "db", "push", "--schema", oldSchema, "--skip-generate"]);
      await run(["node_modules/prisma/build/index.js", "db", "execute", "--file", "prisma/migrations/20261022090000_shared_contacts_followups/migration.sql", "--schema", "prisma/schema.prisma"]);
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-team-contacts-followups.ts"]);
      return;
    }
    if (process.argv.includes("--artist-verification-only")) {
      writeFileSync(oldSchema, execFileSync("git", ["show", "2a7c960:prisma/schema.prisma"], { encoding: "utf8", windowsHide: true }));
      await run(["node_modules/prisma/build/index.js", "db", "push", "--schema", oldSchema, "--skip-generate"]);
      await run(["node_modules/prisma/build/index.js", "db", "execute", "--file", "prisma/migrations/20261022150000_release_artist_verification/migration.sql", "--schema", "prisma/schema.prisma"]);
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-release-artist-verification.ts"]);
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-artist-delivery-mapping.ts"]);
      return;
    }
    if (process.argv.includes("--artist-mapping-only")) {
      await run(["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"]);
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-artist-delivery-mapping.ts"]);
      return;
    }
    if (process.argv.includes("--performance-only")) {
      await run(["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"]);
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-team-performance.ts"]);
      return;
    }
    await run(["node_modules/prisma/build/index.js", "db", "push", "--schema", oldSchema, "--skip-generate"]);
    const migrations = readdirSync("prisma/migrations", { withFileTypes: true }).filter(entry => entry.isDirectory() && /^202610(?:19|22)\d+_/.test(entry.name)).map(entry => path.join("prisma/migrations", entry.name, "migration.sql")).sort();
    for (const migration of migrations) await run(["node_modules/prisma/build/index.js", "db", "execute", "--file", migration, "--schema", "prisma/schema.prisma"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-acquisition-domain.ts"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-crm-workflow.ts"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-team-daily-work.ts"]);
    if (process.argv.includes("--build-browser")) await run(["node_modules/next/dist/bin/next", "build", "--webpack"], process.execPath, { ...env, NODE_ENV: "production" });
    if (process.argv.includes("--browser") || process.argv.includes("--build-browser")) await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-acquisition-browser.ts"]);
  } finally {
    if (process.platform === "win32") await run(["-D", databaseDir, "-m", "fast", "-w", "stop"], path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe")); else await pg.stop();
    if (path.resolve(fixture).startsWith(`${tempRoot}${path.sep}`)) rmSync(fixture, { recursive: true, force: true });
    console.log("Isolated acquisition database stopped; the production database was not used.");
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
