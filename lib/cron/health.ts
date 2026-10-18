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
    // A job that reports itself switched off by configuration is disabled, not
    // failing; treating it as "attention" kept health red permanently.
    const status = !cronEnabled(job) || record?.metadata.disabled ? "disabled" : running ? "running" : interrupted ? "interrupted" : !record ? "never_observed" : record.metadata.state !== "completed" ? "attention" : stale ? "stale" : "healthy";
    return { ...job, status, lastFinishedAt: record?.created_at ?? null, lastRun: record?.metadata ?? null, leasedUntil: running ? lease?.leasedUntil : null };
  });
  const [appointments, clientIntroductions, uncertainEmails, failedEmails, financialTasks, releaseEmailReview] = await Promise.all([
    prisma.teamAppointmentMessage.count({ where: { status: "REVIEW" } }),
    prisma.teamClientWelcome.count({ where: { status: "REVIEW" } }),
    prisma.emailLog.count({ where: { status: "queued", createdAt: { lt: new Date(Date.now() - 5 * 60000) } } }),
    prisma.emailLog.count({ where: { status: "failed", createdAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
    prisma.adminTask.count({ where: { status: "open", type: { in: ["Payment Mismatch", "License Missing"] } } }),
    prisma.emailLog.count({ where: { status: "review", payload: { path: ["channel"], equals: "release_outbox" } } })
  ]);
  const review = { appointments, clientIntroductions, uncertainEmails, failedEmails, financialTasks, releaseEmailReview };
  // The in-process worker runs a job at least every 60s. Without this check a
  // dead worker was invisible: GitHub fallback runs kept jobs looking alive.
  const [worker] = await prisma.$queryRaw<Array<{ age_seconds: number | null }>>`
    SELECT EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) AS age_seconds FROM audit_logs
    WHERE entity='cron_job' AND action='CRON_RUN_STARTED' AND metadata->>'source'='hostinger-runtime'`;
  const workerAge = worker?.age_seconds == null ? null : Math.round(Number(worker.age_seconds));
  const [started] = await prisma.$queryRaw<Array<{ action: string; metadata: Record<string, unknown>; age_seconds: number }>>`
    SELECT action, metadata, EXTRACT(EPOCH FROM (NOW() - created_at)) AS age_seconds FROM audit_logs
    WHERE entity='cron_worker' ORDER BY created_at DESC, id DESC LIMIT 1`;
  const scheduler = {
    primaryWorker: workerAge != null && workerAge <= 600 ? "running" : started ? "started_but_not_triggering" : "never_started",
    lastTriggerSecondsAgo: workerAge,
    lastWorkerEvent: started ? { action: started.action, secondsAgo: Math.round(Number(started.age_seconds)), origin: started.metadata.origin ?? started.metadata.to ?? null } : null,
    note: "In-process worker is primary; GitHub runs are fallback, not evidence of delivery."
  };
  return Response.json({ healthy: Object.values(review).every(count => count === 0) && jobs.every(job => ["healthy", "running", "disabled"].includes(job.status)), jobs, review, scheduler }, { headers: { "Cache-Control": "no-store" } });
}
