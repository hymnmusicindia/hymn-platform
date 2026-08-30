import { assertProductionDatabaseReady } from "../lib/production-database-safety";

assertProductionDatabaseReady().then((identity) => {
  console.log(JSON.stringify({ database: identity.database, schema: identity.schema, branchId: identity.branchId, restrictedRole: identity.restrictedRole, requiredTableCount: identity.tables.length }, null, 2));
}).catch((error) => {
  console.error(error instanceof Error ? error.message : "Production database verification failed.");
  process.exitCode = 1;
});
