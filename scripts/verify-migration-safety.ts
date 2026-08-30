import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { scripts?: Record<string, string> };
const scripts = packageJson.scripts ?? {};
const build = scripts.build ?? "";

assert.match(build, /prisma generate/);
assert.doesNotMatch(build, /db\s+push|accept-data-loss|migrate\s+(dev|reset)/i);
assert.equal(scripts["db:migrate:deploy"], "tsx scripts/deploy-production-migrations.ts");
assert.equal(scripts["deploy:release"], "tsx scripts/deploy-production-migrations.ts");
assert.equal(scripts["db:push"], undefined, "Unsafe db:push shortcut must not be present.");
assert.equal(scripts["db:migrate:fresh"], undefined, "Fresh baseline must not be exposed as an npm production command.");
assert.equal(scripts["db:verify:production"], "tsx scripts/verify-production-database-target.ts");

const deploymentScript = readFileSync(path.join(root, "scripts", "deploy-production-migrations.ts"), "utf8");
const startupScript = readFileSync(path.join(root, "scripts", "start-production.ts"), "utf8");
const databaseSafety = readFileSync(path.join(root, "lib", "production-database-safety.ts"), "utf8");
assert.match(deploymentScript, /assertProductionDatabaseReady/);
assert.match(startupScript, /assertProductionDatabaseReady/);
assert.match(databaseSafety, /EXPECTED_NEON_BRANCH_ID/);
assert.match(databaseSafety, /_prisma_migrations/);

const freshScript = readFileSync(path.join(root, "scripts", "migrate-fresh-database.ts"), "utf8");
assert.match(freshScript, /CONFIRM_EMPTY_DATABASE_BASELINE/);
assert.match(freshScript, /NODE_ENV === "production"/);
assert.match(freshScript, /pg_tables/);
assert.match(freshScript, /Refusing fresh baseline/);
assert.match(freshScript, /"--schema", "prisma\/schema\.prisma"/);
assert.match(freshScript, /migrate", "deploy/);

const baseline = readFileSync(path.join(root, "prisma", "fresh-baseline.sql"), "utf8");
const requiredBaselineFragments = [
  "releases_user_id_status_idx",
  "releases_distributor_release_id_idx",
  "releases_upc_code_idx",
  "tracks_isrc_idx",
  "distribution_orders_razorpay_order_id_key",
  "distribution_orders_razorpay_payment_id_key",
  "payment_webhook_events_provider_event_id_key",
  "royalty_statements_provider_period_start_period_end_idx",
  "royalty_line_items_isrc_idx",
  "royalty_line_items_upc_idx",
  "wallet_transactions_user_id_created_at_idx",
  "payout_requests_user_id_status_idx",
  "audit_logs_entity_created_at_idx",
  "managed_service_requests_service_type_status_submitted_at_idx",
  "managed_service_documents_asset_id_idx",
  "financial_adjustments_idempotency_key_key",
  "payout_requests_one_active_per_user_idx",
  "audit_logs_no_update",
  "distribution_orders_user_id_fkey"
];
for (const fragment of requiredBaselineFragments) assert.ok(baseline.includes(fragment), `Fresh baseline is missing ${fragment}.`);

const migrationDirectory = path.join(root, "prisma", "migrations");
const migrations = readdirSync(migrationDirectory, { withFileTypes: true }).filter(entry => entry.isDirectory());
assert.ok(migrations.length > 0);
for (const migration of migrations) {
  const sql = readFileSync(path.join(migrationDirectory, migration.name, "migration.sql"), "utf8");
  assert.ok(sql.trim(), `${migration.name} has an empty migration.sql.`);
  assert.doesNotMatch(sql, /accept-data-loss/i);
}

const deploymentGuide = readFileSync(path.join(root, "docs", "database-deployment.md"), "utf8");
for (const requirement of ["backup", "migrate deploy", "rollback", "brand-new empty database", "restore"]) {
  assert.ok(deploymentGuide.toLowerCase().includes(requirement), `Deployment guide is missing ${requirement}.`);
}

console.log(`Migration safety verification passed across ${migrations.length} reviewed migrations.`);
// vercel trigger 9
