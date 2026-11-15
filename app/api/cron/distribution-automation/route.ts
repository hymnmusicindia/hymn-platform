import { cronHandler } from '@/lib/cron/runtime';
import { processDistributionAutomation } from '@/lib/distribution-automation';
import { recoverQueuedReviewSignature } from '@/lib/distribution-reviewed-queue';
export const runtime='nodejs';
export const maxDuration=300;
export const GET=cronHandler("distribution-automation",async request=>{
  const params=new URL(request.url).searchParams;
  if(params.has('recoverReviewVersion')||params.has('releaseId')){
    const releaseId=Number(params.get('releaseId')),version=Number(params.get('recoverReviewVersion'));
    if(!Number.isSafeInteger(releaseId)||releaseId<1||!Number.isSafeInteger(version)||version<1)return Response.json({error:'A release ID and exact audited review version are required.'},{status:400});
    try{return Response.json({...await recoverQueuedReviewSignature(releaseId,version),...await processDistributionAutomation(undefined,releaseId)});}
    catch{return Response.json({error:'Review recovery was not completed. Inspect the current audited review, source files and delivery attempt before retrying.'},{status:409});}
  }
  return Response.json(await processDistributionAutomation());
});
