import { processPendingAutomaticAmendments } from '@/lib/release-amendment-automation';
import { syncPendingSupportCorrections } from '@/lib/release-support-corrections';
import { cronHandler } from "@/lib/cron/runtime";
import { pollDireNoteIngestJobs } from "@/lib/direnote-ingest-jobs";
import { processDistributionServiceQueue } from '@/lib/distribution-services';
import { processDistributionWebhookQueue } from '@/lib/distribution-webhooks';

export const runtime = "nodejs";
export const maxDuration = 240;
export const GET = cronHandler("direnote-ingest-status", async () => {
  const deadline=Date.now()+45000,canStart=()=>Date.now()+17000<deadline;
  const ingestion=await pollDireNoteIngestJobs({limit:1});
  const checkedServices=canStart()?await processDistributionServiceQueue(1):0;
  const checkedWebhooks=canStart()?await processDistributionWebhookQueue(1):0;
  const processedAmendments=canStart()?await processPendingAutomaticAmendments():0;
  const checkedCorrections=canStart()?await syncPendingSupportCorrections(1):0;
  return Response.json({...ingestion,processedAmendments,checkedCorrections,checkedServices,checkedWebhooks});
});
