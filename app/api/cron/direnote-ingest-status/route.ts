import { processPendingAutomaticAmendments } from '@/lib/release-amendment-automation';
import { cronHandler } from "@/lib/cron/runtime";
import { pollDireNoteIngestJobs } from "@/lib/direnote-ingest-jobs";

export const runtime = "nodejs";
export const maxDuration = 240;
export const GET = cronHandler("direnote-ingest-status", async () => { const processedAmendments = await processPendingAutomaticAmendments(); return Response.json({ ...await pollDireNoteIngestJobs({ limit: 1 }), processedAmendments }); });
