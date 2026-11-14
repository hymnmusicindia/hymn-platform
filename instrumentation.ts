// Starts the cron worker inside the web server itself, so it runs however the
// host launches Next.js. It previously started only from `npm start`
// (scripts/start-production.ts); when the host launched Next another way, no
// worker ran and every job depended on GitHub's unreliable schedule. Durable
// leases in lib/cron/runtime.ts keep extra processes or fallback triggers from overlapping.
export async function register() {
  // Keep Node-only cron imports inside a positive runtime branch so Next can
  // remove them completely from its instrumentation edge bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) { console.error("Scheduled automation unavailable: CRON_SECRET is missing."); return; }
  if (process.env.HYMN_CRON_WORKER_ENABLED === "false") { console.warn("Cron worker disabled; an external scheduler is required."); return; }
  const flag = globalThis as typeof globalThis & { __hymnCronWorker?: boolean };
  if (flag.__hymnCronWorker) return;
  flag.__hymnCronWorker = true;

  const [{ startCronScheduler }, { prisma }, { getPublicAppUrl }, { dispatchLocalCron }] = await Promise.all([import("./scripts/cron-scheduler"), import("./lib/prisma"), import("./lib/public-app-url"), import("./lib/cron/local-dispatch")]);
  const publicOrigin = getPublicAppUrl();
  const port = Number(process.env.PORT || 3000);
  const loopback = Number.isInteger(port) && port > 0 && port < 65536;
  // Recorded so cron health can tell "worker never started" from "worker started
  // but cannot reach the app" without reading host runtime logs.
  const record = (action: string, metadata: Record<string, unknown>) =>
    prisma.auditLog.create({ data: { actorType: "system", action, entity: "cron_worker", entityId: String(process.pid), metadata: { ...metadata, pid: process.pid } } }).catch(() => undefined);

  // Start after initialization; jobs no longer depend on a loopback port or edge timeout.
  setTimeout(() => {
    const origin = publicOrigin;
    startCronScheduler({
      port: loopback ? port : 3000, secret, origin, fetcher: dispatchLocalCron,
    });
    console.log(`Central cron scheduler started with authenticated in-process handlers.`);
    void record("CRON_WORKER_STARTED", { origin, transport: "in-process", portEnv: process.env.PORT ?? null });
  }, 30_000).unref();
  }
}
