import { pathToFileURL } from "node:url";
import { runCronJobs } from "./run-cron-jobs.mjs";

const healthPath = "/api/cron/health";
const repairable = new Set(["attention", "interrupted", "never_observed", "stale"]);

export async function recoverFailedCronJobs({ baseUrl, secret, fetcher = fetch, log = console.log } = {}) {
  if (!secret?.trim()) throw new Error("CRON_SECRET is missing; no recovery jobs were invoked.");
  const origin = new URL(baseUrl || "https://hymnmusic.fun");
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/") throw new Error("An HTTPS origin without credentials or a path is required.");
  const headers = { authorization: `Bearer ${secret.trim()}`, "x-hymn-cron-source": "github-watchdog" };
  const health = async () => {
    const response = await fetcher(new URL(healthPath, origin), { method: "GET", redirect: "error", headers, signal: AbortSignal.timeout(65000) });
    const body = await response.json();
    if (!Array.isArray(body.jobs)) throw new Error(`Cron health returned HTTP ${response.status} without a job list.`);
    return { response, body };
  };

  const before = await health();
  const failed = before.body.jobs.filter(job => repairable.has(job.status)).map(job => job.id);
  if (failed.length) {
    const results = await runCronJobs([...new Set(failed)], { baseUrl: origin.toString(), secret, fetcher, attempts: 3 });
    log(JSON.stringify({ recovery: results.map(({ job, status, healthy, attempts, reason }) => ({ job, status, healthy, attempts, reason })) }));
    if (results.some(result => !result.healthy)) return { healthy: false, recovered: results.length, failedJobs: results.filter(result => !result.healthy).map(result => result.job) };
  }

  const after = await health();
  const remaining = after.body.jobs.filter(job => repairable.has(job.status)).map(job => job.id);
  const healthy = after.response.ok && after.body.healthy === true && remaining.length === 0;
  log(JSON.stringify({ healthy, recovered: failed.length, remaining }));
  return { healthy, recovered: failed.length, remaining };
}

async function main() {
  try {
    const result = await recoverFailedCronJobs({ baseUrl: process.env.BASE_URL, secret: process.env.CRON_SECRET });
    if (!result.healthy) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Cron recovery failed; credentials were not printed.");
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
