import { cronHandler } from '@/lib/cron/runtime';
import { syncReleaseQcWork, deliverApprovedReleaseQc } from '@/lib/team/release-qc';
export const runtime = 'nodejs';
export const maxDuration = 300;
export const GET = cronHandler('team-release-qc', async () => Response.json({ ...await syncReleaseQcWork(), ...await deliverApprovedReleaseQc() }));
