import { CRON_JOBS, cronEnabled, cronHasFailures } from "../lib/cron/registry";

/** Hostinger scheduler: separate urgent/bulk lanes and guarded endpoint retries. */
export function startCronScheduler(options: { port: number; secret: string; origin?: string; fallbackOrigin?: string; onFallback?: (from: string, to: string) => void; fetcher?: typeof fetch; now?: () => number; random?: () => number }) {
  const fetcher = options.fetcher ?? fetch, now = options.now ?? Date.now, random = options.random ?? Math.random;
  let origin = options.origin ?? `http://127.0.0.1:${options.port}`;
  const next = new Map(CRON_JOBS.map((job, index) => [job.id, now() + index * 2000]));
  const active = new Set<string>(), failures = new Map<string, number>();
  const controller = new AbortController();
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    const due = CRON_JOBS.filter(job => cronEnabled(job) && !active.has(job.id) && (next.get(job.id) ?? 0) <= now()).sort((a, b) => (next.get(a.id) ?? 0) - (next.get(b.id) ?? 0));
    const work: Promise<void>[] = [];
    for (const job of due) {
      const urgentIds = new Set(["team-appointments", "team-performance"]);
      const urgent = urgentIds.has(job.id);
      if (active.has(job.id) || (!urgent && [...active].some(id => !urgentIds.has(id)))) continue;
      active.add(job.id);
      const attemptStarted = now();
      work.push((async () => {
        let healthy = false, domainFailure = false, retryAfter = 0;
        try {
          const response = await fetcher(`${origin}/api/cron/${job.id}`, {
            method: job.method, redirect: "error", headers: { authorization: `Bearer ${options.secret}`, "x-hymn-cron-source": "hostinger-runtime" },
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55_000)])
          });
          const data: unknown = await response.json();
          // A second process can reach the same durable lease while the owner
          // is working. The owner will finish the job; this is a healthy skip.
          healthy = response.ok && !cronHasFailures(data);
          // A completed run that reported problems keeps its normal cadence; fast
          // backoff is for outages, and would repeat provider calls every 30s.
          domainFailure = !healthy && response.headers.get("x-hymn-cron-outcome") === "domain-failure";
          const retry = Number(response.headers.get("retry-after"));
          if (Number.isFinite(retry) && retry > 0) retryAfter = Math.min(retry * 1000, 86400000);
          if (!healthy) console.error("cron job requires attention", { job: job.id, httpStatus: response.status });
        } catch (error) {
          if (!stopped) console.error("cron job unavailable; retry scheduled", { job: job.id, origin });
          // Connection refused on loopback means the server is not listening where
          // we assumed (host-assigned port or socket). Switch to the public origin
          // once. A timeout is excluded: the app answered slowly, so it is reachable.
          const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
          if (!stopped && !timedOut && options.fallbackOrigin && origin !== options.fallbackOrigin) {
            const from = origin;
            origin = options.fallbackOrigin;
            options.onFallback?.(from, origin);
          }
        }
        finally {
          const onCadence = healthy || domainFailure;
          const count = onCadence ? 0 : Math.min(10, (failures.get(job.id) ?? 0) + 1);
          failures.set(job.id, count);
          const delay = onCadence ? job.seconds * 1000 : Math.min(job.seconds * 1000, 30_000 * 2 ** Math.min(count, 6));
          const nextStart = onCadence ? Math.max(now() + 1000, attemptStarted + delay) : now() + delay;
          next.set(job.id, Math.max(nextStart + random() * Math.min(5000, delay / 10), now() + retryAfter));
          active.delete(job.id);
        }
      })());
    }
    await Promise.allSettled(work);
  };
  const timer = setInterval(() => { void tick(); }, 15000);
  timer.unref();
  void tick();
  return { tick, stop() { stopped = true; clearInterval(timer); controller.abort(); }, active };
}
