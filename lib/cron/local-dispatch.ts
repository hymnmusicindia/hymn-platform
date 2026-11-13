import 'server-only';
import { CRON_JOBS } from './registry';
import { authorizedCron } from './runtime';

// Explicit imports keep every route visible to the production bundler. The
// runtime worker uses the same authenticated, leased handlers as HTTP callers.
export const localCronHandlers = {
  'team-release-qc': async (request: Request) => (await import('../../app/api/cron/team-release-qc/route')).GET(request),
  'team-briefings': async (request: Request) => (await import('../../app/api/cron/team-briefings/route')).GET(request),
  'team-appointments': async (request: Request) => (await import('../../app/api/cron/team-appointments/route')).GET(request),
  'playlist-reviews': async (request: Request) => (await import('../../app/api/cron/playlist-reviews/route')).GET(request),
  'team-os': async (request: Request) => (await import('../../app/api/cron/team-os/route')).GET(request),
  'team-push': async (request: Request) => (await import('../../app/api/cron/team-push/route')).GET(request),
  'team-performance': async (request: Request) => (await import('../../app/api/cron/team-performance/route')).GET(request),
  'studio-automation': async (request: Request) => (await import('../../app/api/cron/studio-automation/route')).GET(request),
  'direnote-ingest-status': async (request: Request) => (await import('../../app/api/cron/direnote-ingest-status/route')).GET(request),
  'direnote-release-sync': async (request: Request) => (await import('../../app/api/cron/direnote-release-sync/route')).GET(request),
  'release-status-sync': async (request: Request) => (await import('../../app/api/cron/release-status-sync/route')).GET(request),
  'referral-reconciliation': async (request: Request) => (await import('../../app/api/cron/referral-reconciliation/route')).GET(request),
  'growth-sync': async (request: Request) => (await import('../../app/api/cron/growth-sync/route')).GET(request),
  'draft-reminders': async (request: Request) => (await import('../../app/api/cron/draft-reminders/route')).GET(request),
  'release-emails': async (request: Request) => (await import('../../app/api/cron/release-emails/route')).GET(request),
  'engineer-reminders': async (request: Request) => (await import('../../app/api/cron/engineer-reminders/route')).GET(request),
  'storage-cleanup': async (request: Request) => (await import('../../app/api/cron/storage-cleanup/route')).POST(request),
  'payment-reconciliation': async (request: Request) => (await import('../../app/api/cron/payment-reconciliation/route')).GET(request),
  'gateway-finance': async (request: Request) => (await import('../../app/api/cron/gateway-finance/route')).GET(request),
  'spotify-artist-photos': async (request: Request) => (await import('../../app/api/cron/spotify-artist-photos/route')).GET(request),
  'birthday-notifications': async (request: Request) => (await import('../../app/api/cron/birthday-notifications/route')).GET(request),
  'exchange-rate-refresh': async (request: Request) => (await import('../../app/api/cron/exchange-rate-refresh/route')).POST(request),
  'quarterly-payout-reset': async (request: Request) => (await import('../../app/api/cron/quarterly-payout-reset/route')).POST(request),
  'draft-nudges': async (request: Request) => (await import('../../app/api/cron/draft-nudges/route')).GET(request),
  'account-deletion-cleanup': async (request: Request) => (await import('../../app/api/cron/account-deletion-cleanup/route')).GET(request),
  'direnote-revenue-sync': async (request: Request) => (await import('../../app/api/cron/direnote-revenue-sync/route')).GET(request),
  'team-outreach': async (request: Request) => (await import('../../app/api/cron/team-outreach/route')).GET(request),
  'support-mail': async (request: Request) => (await import('../../app/api/cron/support-mail/route')).GET(request),
  'distribution-automation': async (request: Request) => (await import('../../app/api/cron/distribution-automation/route')).GET(request),
};

export const dispatchLocalCron: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  if (!authorizedCron(request)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  const id = new URL(request.url).pathname.match(/^\/api\/cron\/([a-z-]+)$/)?.[1];
  const job = CRON_JOBS.find(job => job.id === id);
  if (!job || !Object.hasOwn(localCronHandlers, job.id)) return Response.json({ error: 'Unknown scheduled job.' }, { status: 404 });
  if (request.method !== job.method) return Response.json({ error: 'Invalid scheduled method.' }, { status: 405 });
  return localCronHandlers[job.id as keyof typeof localCronHandlers](request);
};
