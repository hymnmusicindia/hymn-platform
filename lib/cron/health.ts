import "server-only";
import { prisma } from "@/lib/prisma";
import { CRON_JOBS, cronEnabled } from "./registry";
export async function cronHealthResponse() {
  const records = await prisma.$queryRaw<Array<{ entity_id: string; action: string; metadata: Record<string, unknown>; created_at: Date; age_seconds: number }>>`
    SELECT DISTINCT ON (entity_id, action) entity_id, action, metadata,
      created_at AT TIME ZONE current_setting('TimeZone') AS created_at,
      EXTRACT(EPOCH FROM (LOCALTIMESTAMP-created_at)) AS age_seconds FROM audit_logs
    WHERE entity='cron_job' AND action IN ('CRON_RUN_FINISHED','CRON_RUN_STARTED')
    ORDER BY entity_id, action, created_at DESC, id DESC`;
  const leases = await prisma.$queryRaw<Array<{ leaseKey: string; leasedUntil: Date; running: boolean }>>`
    SELECT lease_key AS "leaseKey", leased_until AT TIME ZONE current_setting('TimeZone') AS "leasedUntil",
      leased_until > LOCALTIMESTAMP AS running FROM cron_leases WHERE lease_key LIKE 'cron-runtime:%'`;
  const jobs = CRON_JOBS.map(job => {
    const record = records.find(item => item.entity_id === job.id && item.action === "CRON_RUN_FINISHED");
    const start = records.find(item => item.entity_id === job.id && item.action === "CRON_RUN_STARTED");
    const lease = leases.find(item => item.leaseKey === `cron-runtime:${job.id}`);
    const running = !!lease?.running;
    const stale = !record || Number(record.age_seconds) > Math.max(job.seconds * 2, 180);
    const interrupted = !!start && start.metadata.runId !== record?.metadata.runId;
    const status = !cronEnabled(job) ? "disabled" : running ? "running" : interrupted ? "interrupted" : !record ? "never_observed" : record.metadata.state !== "completed" || record.metadata.disabled ? "attention" : stale ? "stale" : "healthy";
    return { ...job, status, lastFinishedAt: record?.created_at ?? null, lastRun: record?.metadata ?? null, leasedUntil: running ? lease?.leasedUntil : null };
  });
  const [appointments, clientIntroductions, uncertainEmails, failedEmails, financialTasks] = await Promise.all([
    prisma.teamAppointmentMessage.count({ where: { status: "REVIEW" } }),
    prisma.teamClientWelcome.count({ where: { status: "REVIEW" } }),
    prisma.emailLog.count({ where: { status: "queued", createdAt: { lt: new Date(Date.now() - 5 * 60000) } } }),
    prisma.emailLog.count({ where: { status: "failed", createdAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
    prisma.adminTask.count({ where: { status: "open", type: { in: ["Payment Mismatch", "License Missing"] } } })
  ]);
  const review = { appointments, clientIntroductions, uncertainEmails, failedEmails, financialTasks };
  return Response.json({ healthy: Object.values(review).every(count => count === 0) && jobs.every(job => ["healthy", "running", "disabled"].includes(job.status)), jobs, review, scheduler: "Hostinger startup worker primary; external triggers are fallback, not evidence of delivery." }, { headers: { "Cache-Control": "no-store" } });
}
