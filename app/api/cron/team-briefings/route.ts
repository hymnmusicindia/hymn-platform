import { cronHandler } from '@/lib/cron/runtime';
import { deliverTeamBriefings } from '@/lib/team/briefing-outbox';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const GET = cronHandler('team-briefings', async request => {
  const value = new URL(request.url).searchParams.get('emailLogId');
  if (value !== null && !/^[1-9]\d{0,9}$/.test(value)) return Response.json({ error: 'Invalid email log ID.' }, { status: 400 });
  return Response.json(await deliverTeamBriefings(value ? Number(value) : undefined));
});
