import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CRON_JOBS, cronEnabled, cronHasFailures } from "../lib/cron/registry";
import { startCronScheduler } from "./cron-scheduler";
import { runCronJobs } from "./run-cron-jobs.mjs";
import { recoverFailedCronJobs } from "./recover-failed-cron-jobs.mjs";

async function main() {
  assert(CRON_JOBS.length >= 21, "The scheduled job registry must include the expected automation set.");
  assert.equal(new Set(CRON_JOBS.map(job => job.id)).size, CRON_JOBS.length, "Cron job IDs must remain unique as jobs are added.");
  const workflows = ["frequent", "hourly", "daily"].map(group => readFileSync(`.github/workflows/cron-${group}.yml`, "utf8")).join("\n");
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  for (const job of CRON_JOBS) {
    assert(job.seconds >= 60 && job.seconds <= 86400);
    assert(workflows.includes(job.id), `${job.id} needs an independent fallback`);
    assert(vercel.crons.some((row: { path: string }) => row.path === `/api/cron/${job.id}`));
    const source = readFileSync(`app/api/cron/${job.id}/route.ts`, "utf8");
    assert(source.includes(`cronHandler("${job.id}"`), `${job.id} must use durable run guards`);
  }
  assert.equal(cronEnabled(CRON_JOBS[0], { TEAM_AUTOMATION_ENABLED: "false" }), false);
  for (const body of [{ success: false }, { errors: ["error"] }, { child: { failed: 1 } }, { messages: [{ status: "REVIEW" }] }, { issues: [{ autoRepaired: false }] }, { issues: ["Gateway unavailable"] }]) assert.equal(cronHasFailures(body), true);
  for (const body of [{ errors: [] }, { skipped: "already_running" }, { child: { sent: 1 } }, { issues: [{ autoRepaired: true }] }]) assert.equal(cronHasFailures(body), false);
  let calls = 0;
  const fetcher = async (_input: unknown, init?: RequestInit) => { calls++; assert.equal(init?.redirect, "error"); return Response.json({ healthy: false }, { status: 503 }); };
  await assert.rejects(() => runCronJobs(["health"], { secret: "", fetcher }), /missing/);
  await assert.rejects(() => runCronJobs(["unknown"], { secret: "fixture", fetcher }), /allowlist/);
  assert.equal(calls, 0);
  assert.equal((await runCronJobs(["health"], { secret: "fixture", fetcher }))[0].healthy, false);
  let transientCalls = 0, delays: number[] = [];
  const recovered = await runCronJobs(["health"], { secret: "fixture", attempts: 3, delay: async ms => { delays.push(ms); }, fetcher: async () => {
    transientCalls++;
    return transientCalls === 1 ? Response.json({ error: "temporary" }, { status: 503 }) : Response.json({ healthy: true });
  } });
  assert.equal(recovered[0].healthy, true, "Transient cron errors must recover within the bounded retry window.");
  assert.equal(recovered[0].attempts, 2);
  assert.equal(transientCalls, 2);
  assert.deepEqual(delays, [1000]);
  let domainCalls = 0;
  const domainFailure = await runCronJobs(["health"], { secret: "fixture", attempts: 3, delay: async () => {}, fetcher: async () => { domainCalls++; return Response.json({ errorCount: 1 }); } });
  assert.equal(domainFailure[0].healthy, false);
  assert.equal(domainCalls, 1, "A domain result with uncertain side effects must not be replayed automatically.");
  let healthCalls = 0, recoveryCalls = 0;
  const recoveredWatchdog = await recoverFailedCronJobs({ secret: "fixture", delay: async () => {}, log: () => {}, fetcher: async input => {
    const url = new URL(String(input));
    if (url.pathname === "/api/cron/health") {
      healthCalls++;
      return Response.json(healthCalls === 1
        ? { healthy: false, jobs: [{ id: "team-appointments", status: "attention" }, { id: "team-os", status: "healthy" }] }
        : { healthy: true, jobs: [{ id: "team-appointments", status: "healthy" }, { id: "team-os", status: "healthy" }] });
    }
    recoveryCalls++;
    return Response.json({ success: true });
  } });
  assert.equal(recoveredWatchdog.healthy, true, "The watchdog must replay unhealthy jobs and recheck health.");
  assert.equal(healthCalls, 2);
  assert.equal(recoveryCalls, 1, "Only unhealthy registered jobs should be replayed.");
  // Keep the urgent request unresolved while a bulk job completes. It must not
  // be duplicated by another tick or block the separate bulk lane.
  let clock = 0, resolveUrgent: ((response: Response) => void) | undefined;
  const invoked: string[] = [];
  const worker = startCronScheduler({ port: 3000, secret: "fixture", now: () => clock, random: () => 0, fetcher: (async input => {
    const id = new URL(String(input)).pathname.split("/").at(-1)!; invoked.push(id);
    if (id === "team-appointments") return new Promise<Response>(resolve => { resolveUrgent = resolve; });
    return Response.json({ success: true });
  }) as typeof fetch });
  try {
    clock = 300000;
    await worker.tick();
    assert.deepEqual(invoked.slice(0, 2), ["team-appointments", "playlist-reviews"]);
    assert.equal(invoked.filter(id => id === "team-appointments").length, 1);
    resolveUrgent!(Response.json({ success: true }));
    await new Promise(resolve => setImmediate(resolve));
    clock += 999;
    await worker.tick();
    assert.equal(invoked.filter(id => id === "team-appointments").length, 1);
    clock += 1;
    const next = worker.tick();
    assert.equal(invoked.filter(id => id === "team-appointments").length, 2);
    resolveUrgent!(Response.json({ success: true })); await next;
  } finally { worker.stop(); }
  let retryClock = 0, urgentAttempts = 0;
  const retryWorker = startCronScheduler({ port: 3000, secret: "fixture", now: () => retryClock, random: () => 0, fetcher: (async input => {
    if (String(input).endsWith("/team-appointments")) { urgentAttempts++; return Response.json({ error: "fixture capacity" }, { status: 429, headers: { "Retry-After": "120" } }); }
    return Response.json({ success: true });
  }) as typeof fetch });
  try {
    await new Promise(resolve => setImmediate(resolve));
    retryClock = 119999; await retryWorker.tick();
    assert.equal(urgentAttempts, 1, "Provider Retry-After must override the ordinary minute retry.");
    retryClock = 120000; await retryWorker.tick();
    assert.equal(urgentAttempts, 2);
  } finally { retryWorker.stop(); }
  console.log("Cron registry, fallback coverage, failure classification, safe runner validation and urgent/bulk lane isolation passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
