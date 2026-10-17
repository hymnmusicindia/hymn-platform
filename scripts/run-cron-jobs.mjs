import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const jobs = JSON.parse(readFileSync(new URL("../lib/cron/jobs.json", import.meta.url), "utf8"));

export async function runCronJobs(ids, { baseUrl, secret, fetcher = fetch } = {}) {
  if (!secret?.trim()) throw new Error("CRON_SECRET is missing; no jobs were invoked.");
  const origin = new URL(baseUrl || "https://hymnmusic.fun");
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/") throw new Error("An HTTPS origin without credentials or a path is required.");
  const requested = ids.map(id => id === "health" ? { id, method: "GET" } : jobs.find(job => job.id === id));
  if (!requested.length || requested.some(job => !job)) throw new Error("Unknown or empty job allowlist; no jobs were invoked.");
  const results = [];
  for (const job of requested) {
    try {
      const response = await fetcher(new URL(`/api/cron/${job.id}`, origin), { method: job.method, redirect: "error", headers: { authorization: `Bearer ${secret.trim()}`, "x-hymn-cron-source": "github-fallback" }, signal: AbortSignal.timeout(65000) });
      const data = await response.json();
      const healthy = response.ok && data.success !== false && data.ok !== false && data.healthy !== false && !(data.errorCount > 0);
      // Log operational status only; provider responses may contain customer data.
      results.push({ job: job.id, status: response.status, healthy });
    } catch { results.push({ job: job.id, status: 0, healthy: false }); }
  }
  return results;
}
async function main() {
  try {
    const results = await runCronJobs(process.argv.slice(2), { baseUrl: process.env.BASE_URL, secret: process.env.CRON_SECRET });
    console.log(JSON.stringify(results));
    if (results.some(result => !result.healthy)) process.exitCode = 1;
  } catch { console.error("Cron fallback configuration or execution failed; credentials were not printed."); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
