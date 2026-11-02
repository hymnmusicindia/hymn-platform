import {processRequestedBeatFiles} from "@/lib/beat-file-fulfilment";
import {deliverBeatSampleRequests} from "@/lib/email/beat-sample-requests";
import {repairPendingBeatQc} from "@/lib/beat-publication";
import { repairPendingReviewHandoffs } from '@/lib/release-review-handoff';
import { cronHandler } from "@/lib/cron/runtime";
import { deliverReleaseOutbox } from "@/lib/email/release-outbox";
import { repairRecentAmendmentAcknowledgements } from '@/lib/release-amendment-notifications';
import {deliverRequestedBeats} from '@/lib/email/beat-delivery';
export const runtime = "nodejs";
export const GET = cronHandler("release-emails", async request => {
  const params=new URL(request.url).searchParams;
  if(params.has('releaseId') || params.has('emailLogId')){
    const releaseId=Number(params.get('releaseId')),emailLogId=params.has('emailLogId')?Number(params.get('emailLogId')):undefined;
    if(!Number.isSafeInteger(releaseId)||releaseId<1 || emailLogId!==undefined && (!Number.isSafeInteger(emailLogId)||emailLogId<1))return Response.json({error:'Valid releaseId and optional emailLogId are required.'},{status:400});
    return Response.json(await deliverReleaseOutbox([releaseId],1,undefined,emailLogId?[emailLogId]:undefined));
  }
  const repairedReviews = await repairPendingReviewHandoffs(); const repairedAmendments = await repairRecentAmendmentAcknowledgements(); return Response.json({ ...await deliverReleaseOutbox(), repairedAmendments, repairedReviews, requestedBeatFiles:await processRequestedBeatFiles().catch(()=>({deferred:true})),sampleRequests:await deliverBeatSampleRequests().catch(()=>({deferred:true})),beatQc:await repairPendingBeatQc().catch(()=>({deferred:true})), beatDelivery:await deliverRequestedBeats().catch(()=>({deferred:true})) });
});
