import { PrismaClient } from "@prisma/client";
import { assertDireNoteSchemaReady } from "../lib/direnote-schema-readiness";

async function main() {
  if (process.argv.includes("--production-build") && process.env.VERCEL_ENV !== "production") return;
  const db = new PrismaClient();
  try {
    await assertDireNoteSchemaReady(db);
    console.log("DireNote submission schema is ready.");
  } finally { await db.$disconnect(); }
}
main().catch(error => {
  console.error(error instanceof Error && error.message.startsWith("DireNote database migration required:") ? error.message : "DireNote schema verification failed. Check database connectivity and apply production migrations before deploying.");
  process.exitCode = 1;
});
