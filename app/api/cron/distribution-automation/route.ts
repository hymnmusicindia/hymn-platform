import { cronHandler } from '@/lib/cron/runtime';
import { processDistributionAutomation } from '@/lib/distribution-automation';
export const runtime='nodejs';
export const maxDuration=300;
export const GET=cronHandler("distribution-automation",async()=>Response.json(await processDistributionAutomation()));
