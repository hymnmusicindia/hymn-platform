import { cronHandler } from '@/lib/cron/runtime';
import { queuePerformanceReports, deliverPerformanceReports } from '@/lib/team/performance-outbox';
import { queueNightlyPlans, deliverNightlyPlans } from '@/lib/team/nightly-plan';
export const runtime = 'nodejs';
export const maxDuration = 120;
export const GET = cronHandler("team-performance", async () => {
  const now = new Date();
  // An independent weekly-report failure must not block tomorrow's work plan.
  const [performance, nightly] = await Promise.allSettled([
    (async () => ({ ...await queuePerformanceReports(now), ...await deliverPerformanceReports(now) }))(),
    (async () => ({ ...await queueNightlyPlans(now), ...await deliverNightlyPlans(now) }))(),
  ]);
  return Response.json({
    ...(performance.status === 'fulfilled' ? performance.value : { error: 'Weekly report phase failed.' }),
    nightly: nightly.status === 'fulfilled' ? nightly.value : { error: 'Nightly plan phase failed.' },
  }, { status: performance.status === 'rejected' || nightly.status === 'rejected' ? 503 : 200 });
});
