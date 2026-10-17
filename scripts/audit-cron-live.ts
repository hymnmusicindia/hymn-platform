import { PrismaClient } from "@prisma/client";
async function main() {
  if (!process.argv[2]) throw new Error("Provide an environment file; this audit is read-only.");
  process.loadEnvFile(process.argv[2]);
  const db = new PrismaClient();
  try {
    const [leases, recentReleaseRuns, appointmentQueue, clientIntroductions, emailStates, observedJobs] = await Promise.all([
      db.$queryRaw`SELECT lease_key, leased_until>LOCALTIMESTAMP AS running FROM cron_leases ORDER BY lease_key`,
      db.direNoteSyncRun.findMany({ orderBy: { startedAt: "desc" }, take: 3, select: { status: true, startedAt: true, processedCount: true, errorCount: true, deferredCount: true } }),
      db.teamAppointmentMessage.groupBy({ by: ["status"], _count: true }),
      db.teamClientWelcome.groupBy({ by: ["status"], _count: true }),
      db.emailLog.groupBy({ by: ["status"], _count: true }),
      db.auditLog.count({ where: { action: "CRON_RUN_FINISHED", entity: "cron_job" } })
    ]);
    console.log(JSON.stringify({ readOnly: true, leases, recentReleaseRuns, appointmentQueue, clientIntroductions, emailStates, unifiedRunRecords: observedJobs }, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Read-only cron audit unavailable; credentials were not printed."); process.exitCode = 1; });
