import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const jobs = JSON.parse(readFileSync(new URL("../lib/cron/jobs.json", import.meta.url), "utf8"));

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runCronJobs(ids, { baseUrl, secret, fetcher = fetch, attempts = 3, delay = wait, sleepMs = 1000 } = {}) {
  if (!secret?.trim()) throw new Error("CRON_SECRET is missing; no jobs were invoked.");
  const origin = new URL(baseUrl || "https://hymnmusic.fun");
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/") throw new Error("An HTTPS origin without credentials or a path is required.");
  const requested = ids.map(id => id === "health" ? { id, method: "GET" } : jobs.find(job => job.id === id));
  if (!requested.length || requested.some(job => !job)) throw new Error("Unknown or empty job allowlist; no jobs were invoked.");
  const results = [];
  const requestedAttempts = Number(attempts);
  const maxAttempts = Number.isFinite(requestedAttempts) ? Math.max(1, Math.min(requestedAttempts, 5)) : 3;
  for (const job of requested) {
    let result = { job: job.id, status: 0, healthy: false, attempts: 0 };
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetcher(new URL(`/api/cron/${job.id}`, origin), { method: job.method, redirect: "error", headers: { authorization: `Bearer ${secret.trim()}`, "x-hymn-cron-source": "github-fallback" }, signal: AbortSignal.timeout(65000) });
        let data;
        try { data = await response.json(); } catch { data = null; }
        const healthy = !!data && response.ok && data.success !== false && data.ok !== false && data.healthy !== false && !(data.errorCount > 0);
        const domainFailure = response.headers.get("x-hymn-cron-outcome") === "domain-failure";
        result = { job: job.id, status: response.status, healthy, attempts: attempt, ...(healthy ? {} : { reason: domainFailure ? "job_reported_errors" : data ? "http_error" : "non_json_response" }) };
        // Domain failures are not retried here because their side-effect outcome
        // may be uncertain. HTTP retries rely on cron leases and domain idempotency.
        if (healthy || domainFailure || ![408, 425, 429, 500, 502, 503, 504].includes(response.status)) break;
        const retryAfter = Number(response.headers.get("retry-after"));
        if (attempt < maxAttempts) await delay(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(60_000, retryAfter * 1000) : Math.min(30_000, sleepMs * 2 ** (attempt - 1)));
      } catch (error) {
        const reason = error?.name === "TimeoutError" ? "timeout" : /redirect/i.test(String(error?.cause?.message ?? error?.message)) ? "redirect" : "network";
        result = { job: job.id, status: 0, healthy: false, attempts: attempt, reason };
        if (attempt < maxAttempts) await delay(Math.min(30_000, sleepMs * 2 ** (attempt - 1)));
      }
    }
    // Log operational status only; provider responses may contain customer data.
    results.push(result);
  }
  return results;
}

async function main() {
  try {
    const results = await runCronJobs(process.argv.slice(2), { baseUrl: process.env.BASE_URL, secret: process.env.CRON_SECRET });
    console.log(JSON.stringify(results));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `failed_jobs=${results.filter(result => !result.healthy).map(result => result.job).join(" ")}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `| Job | Result | HTTP | Attempts |\n|---|---:|---:|---:|\n${results.map(result => `| ${result.job} | ${result.healthy ? "healthy" : "failed"} | ${result.status} | ${result.attempts} |`).join("\n")}\n`);
    if (results.some(result => !result.healthy)) process.exitCode = 1;
  } catch { console.error("Cron fallback configuration or execution failed; credentials were not printed."); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
