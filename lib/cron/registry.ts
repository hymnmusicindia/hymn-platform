import jobs from "./jobs.json";
export const CRON_JOBS = jobs as ReadonlyArray<{ id: string; method: "GET" | "POST"; seconds: number; purpose: string; flag?: string }>;
export type CronJobId = typeof CRON_JOBS[number]["id"];
export function cronEnabled(job: typeof CRON_JOBS[number], env: Record<string, string | undefined> = process.env) {
  return !(job.flag && env[job.flag] === "false");
}

/** Nested services use several result shapes; HTTP 200 alone is not health. */
export function cronHasFailures(value: unknown, depth = 0): boolean {
  if (depth > 6 || !value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(item => cronHasFailures(item, depth + 1));
  const row = value as Record<string, unknown>;
  if (Array.isArray(row.issues) && row.issues.some(issue => typeof issue === "string" || !!issue && typeof issue === "object" && (issue as { autoRepaired?: boolean }).autoRepaired === false)) return true;
  if (row.success === false || row.ok === false || row.status === "REVIEW" || row.status === "failed" || row.disabled === true) return true;
  for (const key of ["errorCount", "errors", "failed", "failureCount"]) {
    const field = row[key];
    if (typeof field === "number" && field > 0 || Array.isArray(field) && field.length > 0) return true;
  }
  if (typeof row.error === "string" && row.error.trim()) return true;
  return Object.values(row).some(child => cronHasFailures(child, depth + 1));
}
