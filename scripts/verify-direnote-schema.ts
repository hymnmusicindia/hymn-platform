import { PrismaClient } from "@prisma/client";
import { assertDireNoteSchemaReady } from "../lib/direnote-schema-readiness";
import { assertTeamSchemaReady } from "../lib/team/schema-readiness";

async function main() {
  if (process.argv.includes("--production-build") && process.env.VERCEL_ENV !== "production") return;
  const db = new PrismaClient();
  try {
    await assertDireNoteSchemaReady(db);
    await assertTeamSchemaReady(db);
    console.log("DireNote submission schema is ready.");
  } finally { await db.$disconnect(); }
}
main().catch(error => {
  console.error(error instanceof Error && /migration required:/.test(error.message) ? error.message : "Production schema verification failed. Check database connectivity and apply production migrations before deploying.");
  process.exitCode = 1;
});
