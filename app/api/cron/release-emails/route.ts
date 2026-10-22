import { cronHandler } from "@/lib/cron/runtime";
import { deliverReleaseOutbox } from "@/lib/email/release-outbox";
import { repairRecentAmendmentAcknowledgements } from '@/lib/release-amendment-notifications';
export const runtime = "nodejs";
export const GET = cronHandler("release-emails", async () => { const repairedAmendments = await repairRecentAmendmentAcknowledgements(); return Response.json({ ...await deliverReleaseOutbox(), repairedAmendments }); });
