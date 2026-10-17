"use client";
import { useEffect, useState } from "react";
import styles from "./admin-manual-cron.module.css";
type Health = { healthy: boolean; jobs: Array<{ id: string; purpose: string; status: string; lastFinishedAt: string | null }> ; review?: Record<string, number> };
export function CronHealthPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function refresh(signal?: AbortSignal) {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/cron/health", { cache: "no-store", signal });
      if (!response.ok) throw new Error("Automation health is unavailable; check access and database connectivity.");
      setHealth(await response.json()); setError("");
    } catch (error) { if (!signal?.aborted) setError(error instanceof Error ? error.message : "Health check failed."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, []);
  return <section className={styles.panel} aria-label="Scheduled automation health" aria-busy={loading}>
    <div className={styles.heading}><div><p className={styles.label}>Automation health</p><h2>{!health ? "Checking scheduled jobs" : health.healthy ? "Scheduled jobs are reporting" : "Scheduled jobs need attention"}</h2><p>Persistent run history, missing heartbeats and delivery review queues. A running job is not proof of successful delivery.</p></div><button type="button" disabled={loading} onClick={() => void refresh()}>{loading ? "Checking…" : "Refresh health"}</button></div>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {health ? <details className={styles.details}><summary>{health.jobs.length} jobs · {health.jobs.filter(job => !["healthy", "running", "disabled"].includes(job.status)).length} need attention</summary><ul>{health.jobs.map(job => <li key={job.id}><div><strong>{job.id}</strong><p>{job.purpose}</p></div><span>{job.status.replaceAll("_", " ")} · {job.lastFinishedAt ? new Date(job.lastFinishedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }) + " IST" : "No completed run observed"}</span></li>)}</ul><p>Delivery review queues: {Object.entries(health.review ?? {}).map(([key, count]) => `${key}: ${count}`).join(" · ")}</p></details> : null}
  </section>;
}
