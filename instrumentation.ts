// Starts the cron worker inside the web server itself, so it runs however the
// host launches Next.js. It previously started only from `npm start`
// (scripts/start-production.ts); when the host launched Next another way, no
// worker ran and every job depended on GitHub's unreliable schedule. Durable leases in
// lib/cron/runtime.ts keep extra processes or fallback triggers from overlapping.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) { console.error("Scheduled automation unavailable: CRON_SECRET is missing."); return; }
  if (process.env.HYMN_CRON_WORKER_ENABLED === "false") { console.warn("Cron worker disabled; an external scheduler is required."); return; }
  const flag = globalThis as typeof globalThis & { __hymnCronWorker?: boolean };
  if (flag.__hymnCronWorker) return;
  flag.__hymnCronWorker = true;

  const { startCronScheduler } = await import("./scripts/cron-scheduler");
  const port = Number(process.env.PORT || 3000);
  // A host that hands Next a socket path instead of a TCP port cannot be reached
  // on loopback; fall back to the public origin rather than not scheduling.
  const loopback = Number.isInteger(port) && port > 0 && port < 65536;
  const origin = loopback ? undefined : (process.env.NEXT_PUBLIC_APP_URL || "https://hymnmusic.fun").replace(/\/+$/, "");
  // Give the server time to start listening before the first loopback call.
  setTimeout(() => {
    startCronScheduler({ port: loopback ? port : 3000, secret, origin });
    console.log(`Central cron scheduler started via ${origin ?? `127.0.0.1:${port}`}.`);
  }, 30_000).unref();
}
