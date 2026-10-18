import { cronHandler } from "@/lib/cron/runtime";
import { deliverReleaseOutbox } from "@/lib/email/release-outbox";
export const runtime = "nodejs";
export const GET = cronHandler("release-emails", async () => Response.json(await deliverReleaseOutbox()));
