import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { CRON_JOBS, cronEnabled, cronHasFailures, type CronJobId } from "./registry";

export function authorizedCron(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** No Promise.race timeout: releasing a lease while work still runs is unsafe.
 * Individual I/O and service loops own their deadlines. Lease exceeds maxDuration. */
export function cronHandler(id: CronJobId, handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    if (!authorizedCron(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
    const job = CRON_JOBS.find(job => job.id === id)!;
    if (!cronEnabled(job)) return Response.json({ success: true, skipped: "disabled", job: id }, { headers: { "Cache-Control": "no-store" } });
    const runId = randomUUID(), key = `cron-runtime:${id}`, started = Date.now();
    let acquired = false;
    try {
      const rows = await prisma.$queryRaw<Array<{ run_id: string }>>`
        INSERT INTO cron_leases (lease_key, run_id, leased_until, updated_at)
        VALUES (${key}, ${runId}, NOW() + INTERVAL '10 minutes', NOW())
        ON CONFLICT (lease_key) DO UPDATE SET run_id=EXCLUDED.run_id, leased_until=EXCLUDED.leased_until, updated_at=NOW()
        WHERE cron_leases.leased_until < NOW() RETURNING run_id`;
      acquired = rows[0]?.run_id === runId;
      if (!acquired) return Response.json({ success: true, skipped: "already_running", job: id }, { headers: { "Cache-Control": "no-store" } });
      // Fail closed if the durable start record cannot be written.
      await prisma.auditLog.create({ data: { actorType: "system", action: "CRON_RUN_STARTED", entity: "cron_job", entityId: id, metadata: { runId, source: request.headers.get("x-hymn-cron-source")?.slice(0, 60) ?? "external" } } });
      const response = await handler(request);
      let body: unknown;
      try { body = await response.clone().json(); } catch { body = { error: "Job returned a non-JSON result." }; }
      const failed = !response.ok || cronHasFailures(body);
      // Store counts/state only, never recipient lists, tokens or provider payloads.
      await prisma.auditLog.create({ data: { actorType: "system", action: "CRON_RUN_FINISHED", entity: "cron_job", entityId: id, metadata: { runId, state: failed ? "failed" : "completed", httpStatus: response.status, durationMs: Date.now() - started, disabled: !!body && typeof body === "object" && ((body as { enabled?: boolean }).enabled === false || (body as { skipped?: string }).skipped === "disabled") } } });
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store"); headers.set("X-HYMN-Cron-Run", runId);
      return new Response(response.body, { status: failed && response.ok ? 503 : response.status, headers });
    } catch {
      if (acquired) await prisma.auditLog.create({ data: { actorType: "system", action: "CRON_RUN_FINISHED", entity: "cron_job", entityId: id, metadata: { runId, state: "failed", durationMs: Date.now() - started, reason: "Job or audit persistence failed; inspect domain logs before retrying uncertain side effects." } } }).catch(() => undefined);
      return Response.json({ success: false, job: id, runId, error: "Scheduled job did not complete. Inspect its run and domain logs." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    } finally {
      if (acquired) await prisma.$executeRaw`UPDATE cron_leases SET leased_until=NOW(), updated_at=NOW() WHERE lease_key=${key} AND run_id=${runId}`.catch(() => undefined);
    }
  };
}
