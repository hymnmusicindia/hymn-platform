import { cronHandler } from '@/lib/cron/runtime';
import { queuePerformanceReports, deliverPerformanceReports } from '@/lib/team/performance-outbox';
export const runtime = 'nodejs';
export const maxDuration = 120;
export const GET = cronHandler("team-performance", async () => {
  const now = new Date();
  return Response.json({ ...await queuePerformanceReports(now), ...await deliverPerformanceReports(now) });
});
