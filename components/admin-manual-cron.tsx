"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import styles from "./admin-manual-cron.module.css";
import { CronHealthPanel } from "./cron-health-panel";

type Result = { success?: boolean; skipped?: string; error?: string; processedCount?: number; changedCount?: number; correctionCount?: number; errorCount?: number; results?: Array<{ releaseId: number; title: string; success: boolean; status?: string; error?: string }> };

export function AdminManualCron() {
  const router = useRouter();
  const lock = useRef(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  async function run() {
    if (lock.current) return;
    lock.current = true; setRunning(true); setResult(null);
    try {
      const response = await fetch("/api/admin/cron/release-status", { method: "POST", signal: AbortSignal.timeout(310_000) });
      const data: Result = await response.json();
      setResult(response.ok || data.results ? data : { error: data.error || "The sync could not complete. Check the audit log before retrying." });
      if ((response.ok || data.results?.some(item => item.success)) && !data.skipped) router.refresh();
    } catch { setResult({ error: "The connection ended before a result was received. The job may still be running; check the audit log before retrying." }); }
    finally { lock.current = false; setRunning(false); }
  }
  return <><CronHealthPanel /><section className={styles.panel} aria-labelledby="manual-cron-title" aria-busy={running}>
    <div className={styles.heading}><div><p className={styles.label}>Super admin</p><h2 id="manual-cron-title">Release-status sync</h2><p>Fetch eligible release statuses and correction requests from DireNote. Status changes may notify customers.</p></div><button type="button" onClick={run} disabled={running}><RefreshCw size={15} aria-hidden="true" />{running ? "Sync running…" : "Run sync now"}</button></div>
    <div role="status" aria-live="polite">{running ? <p className={styles.notice}>This can take up to five minutes. Keep this page open; duplicate runs are prevented.</p> : null}
      {result?.error ? <p className={styles.error}>{result.error}</p> : result?.skipped ? <p className={styles.notice}>{result.skipped === "already_running" ? "A sync is already running. No duplicate job was started." : "Automatic release syncing is disabled in the server configuration."}</p> : result ? <p className={styles.notice}>{result.errorCount ? "Completed with issues" : "Sync complete"} · {result.processedCount ?? 0} checked · {result.changedCount ?? 0} synced · {result.correctionCount ?? 0} corrections · {result.errorCount ?? 0} errors</p> : null}
    </div>
    {result?.results?.length ? <details className={styles.details}><summary>View per-release results</summary><ul>{result.results.map(item => <li key={item.releaseId}><strong>{item.title}</strong><span>{item.success ? item.status?.replaceAll("_", " ") || "Synced" : item.error || "Sync failed"}</span></li>)}</ul></details> : null}
  </section></>;
}
