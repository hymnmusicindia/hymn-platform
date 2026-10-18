// Starts the cron worker inside the web server itself, so it runs however the
// host launches Next.js. It previously started only from `npm start`
// (scripts/start-production.ts); when the host launched Next another way, no
// worker ran and every job depended on GitHub's unreliable schedule. Durable
// leases in lib/cron/runtime.ts keep extra processes or fallback triggers from overlapping.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) { console.error("Scheduled automation unavailable: CRON_SECRET is missing."); return; }
  if (process.env.HYMN_CRON_WORKER_ENABLED === "false") { console.warn("Cron worker disabled; an external scheduler is required."); return; }
  const flag = globalThis as typeof globalThis & { __hymnCronWorker?: boolean };
  if (flag.__hymnCronWorker) return;
  flag.__hymnCronWorker = true;

  const [{ startCronScheduler }, { prisma }] = await Promise.all([import("./scripts/cron-scheduler"), import("./lib/prisma")]);
  const publicOrigin = (process.env.NEXT_PUBLIC_APP_URL || "https://hymnmusic.fun").replace(/\/+$/, "");
  const port = Number(process.env.PORT || 3000);
  const loopback = Number.isInteger(port) && port > 0 && port < 65536;
  // Recorded so cron health can tell "worker never started" from "worker started
  // but cannot reach the app" without reading host runtime logs.
  const record = (action: string, metadata: Record<string, unknown>) =>
    prisma.auditLog.create({ data: { actorType: "system", action, entity: "cron_worker", entityId: String(process.pid), metadata: { ...metadata, pid: process.pid } } }).catch(() => undefined);

  // Give the server time to start listening before the first loopback call.
  setTimeout(() => {
    const origin = loopback ? `http://127.0.0.1:${port}` : publicOrigin;
    startCronScheduler({
      port: loopback ? port : 3000, secret, origin, fallbackOrigin: publicOrigin,
      onFallback: (from, to) => {
        console.warn(`Cron worker could not reach ${from}; using ${to}.`);
        void record("CRON_WORKER_FALLBACK", { from, to });
      }
    });
    console.log(`Central cron scheduler started via ${origin}.`);
    void record("CRON_WORKER_STARTED", { origin, portEnv: process.env.PORT ?? null });
  }, 30_000).unref();
}
