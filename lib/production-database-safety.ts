import { PrismaClient } from "@prisma/client";

const REQUIRED_TABLES = ["_prisma_migrations", "users", "releases", "tracks", "sessions", "audit_logs"] as const;

// HYMN has one canonical production database. Keep this identity in source control so
// a missing or overwritten Hostinger environment variable cannot silently point the
// application at a fresh Neon branch and make production data appear to disappear.
// Updated 2026-09-03. Production was rebuilt onto a new Neon branch on 2026-09-02
// after the previous branch (br-dry-fog-aym0quvm) was destroyed; that branch is
// retained read-only as incident evidence. Update this constant and
// EXPECTED_NEON_BRANCH_ID together whenever production moves branch, or startup
// will fail closed.
const CANONICAL_PRODUCTION_DATABASE = "neondb";
const CANONICAL_PRODUCTION_NEON_BRANCH_ID = "br-flat-leaf-ayqnxxeg";

export type ProductionDatabaseIdentity = {
  database: string;
  schema: string | null;
  branchId: string | null;
  host: string;
  tables: string[];
  restrictedRole: boolean;
};

function configuredUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value || !/^postgres(?:ql)?:\/\//i.test(value)) throw new Error("DATABASE_URL must be a PostgreSQL URL.");
  return new URL(value);
}

export async function assertProductionDatabaseReady(client = new PrismaClient(), options: { enforceRestrictedRole?: boolean } = {}): Promise<ProductionDatabaseIdentity> {
  const url = configuredUrl();
  const expectedHost = process.env.EXPECTED_DATABASE_HOST?.trim().toLowerCase();
  const configuredExpectedDatabase = process.env.EXPECTED_DATABASE_NAME?.trim();
  const configuredExpectedBranchId = process.env.EXPECTED_NEON_BRANCH_ID?.trim();
  if (configuredExpectedDatabase && configuredExpectedDatabase !== CANONICAL_PRODUCTION_DATABASE) {
    throw new Error("Database safety check failed: EXPECTED_DATABASE_NAME conflicts with HYMN's canonical production database.");
  }
  if (configuredExpectedBranchId && configuredExpectedBranchId !== CANONICAL_PRODUCTION_NEON_BRANCH_ID) {
    throw new Error("Database safety check failed: EXPECTED_NEON_BRANCH_ID conflicts with HYMN's canonical production branch.");
  }
  if (expectedHost && url.hostname.toLowerCase() !== expectedHost) throw new Error(`Database safety check failed: connected host does not match EXPECTED_DATABASE_HOST.`);
  if (url.pathname.replace(/^\//, "") !== CANONICAL_PRODUCTION_DATABASE) throw new Error("Database safety check failed: DATABASE_URL does not target HYMN's canonical production database.");

  try {
    const [identity] = await client.$queryRawUnsafe<Array<{ database: string; schema: string | null; branchId: string | null; canCreateSchemaObjects: boolean; superuser: boolean }>>(
      `SELECT current_database() AS database, current_schema() AS schema, current_setting('neon.branch_id', true) AS "branchId", has_schema_privilege(current_user, 'public', 'CREATE') AS "canCreateSchemaObjects", (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser`
    );
    const tableRows = await client.$queryRawUnsafe<Array<{ tableName: string }>>(
      `SELECT "tableName" FROM (VALUES ('_prisma_migrations'), ('users'), ('releases'), ('tracks'), ('sessions'), ('audit_logs')) AS required("tableName") WHERE to_regclass(format('public.%I', "tableName")) IS NOT NULL`
    );
    const tables = tableRows.map((row) => row.tableName);
    const missing = REQUIRED_TABLES.filter((table) => !tables.includes(table));
    if (identity?.schema !== "public" || missing.length) {
      throw new Error(`Database safety check failed: expected production schema is incomplete (missing: ${missing.join(", ") || "public schema"}). Refusing to continue.`);
    }
    if (identity.branchId !== CANONICAL_PRODUCTION_NEON_BRANCH_ID) throw new Error("Database safety check failed: connection does not target HYMN's canonical production Neon branch.");
    const restrictedRole = !identity.canCreateSchemaObjects && !identity.superuser;
    const enforceRestrictedRole = options.enforceRestrictedRole ?? process.env.REQUIRE_RESTRICTED_DATABASE_ROLE === "true";
    if (enforceRestrictedRole && !restrictedRole) throw new Error("Database safety check failed: runtime DATABASE_URL can modify schema objects. Configure a restricted Neon application role.");
    return { database: identity.database, schema: identity.schema, branchId: identity.branchId, host: url.hostname, tables, restrictedRole };
  } finally {
    await client.$disconnect();
  }
}
