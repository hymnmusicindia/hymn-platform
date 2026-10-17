import { cronHandler } from "@/lib/cron/runtime";
import { pollDireNoteIngestJobs } from "@/lib/direnote-ingest-jobs";

export const runtime = "nodejs";
export const maxDuration = 90;
export const GET = cronHandler("direnote-ingest-status", async () => Response.json(await pollDireNoteIngestJobs({ limit: 1 })));
