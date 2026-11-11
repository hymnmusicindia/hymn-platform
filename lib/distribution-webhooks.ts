import 'server-only';
import { createHash,createHmac,timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { prisma } from './prisma';
import { object } from './distribution-services-contract';
import { syncDistributionService,callDistributionEndpoint } from './distribution-services';
import { syncDireNoteRelease } from './direnote-service';
import { syncSupportCorrection } from './release-support-corrections';
import { createAdminTaskOnce } from './task-queue';
import { redactDireNoteDiagnostic } from './direnote';
import { emailLayout,emailText } from './email/email-templates';
import { getPublicAppUrl } from './public-app-url';
const knownTypes=['release.approved','release.rejected','release.live','video.approved','video.rejected','metadata_request.approved','metadata_request.rejected','payout.completed','payout.rejected','copyright_claim.created'];
const eventSchema=z.object({id:z.string().regex(/^evt_[A-Za-z0-9_-]{1,128}$/),type:z.string().min(1).max(100),created_at:z.string().datetime({offset:true}),data:z.record(z.string(),z.unknown())}).strip();
export function verifyDistributionSignature(raw:Uint8Array,header:string,secret:string,now=Date.now()){
  if(!secret || raw.byteLength>256*1024)return false;
  const parts=header.split(',').map(v=>v.trim()),values=Object.fromEntries(parts.map(v=>v.split('=')));
  if(parts.length!==2 || !/^\d{10,12}$/.test(values.t||'') || !/^[a-f0-9]{64}$/.test(values.v1||'') || Math.abs(now/1000-Number(values.t))>300)return false;
  const expected=createHmac('sha256',secret).update(`${values.t}.`).update(raw).digest();
  return timingSafeEqual(expected,Buffer.from(values.v1,'hex'));
}
export async function receiveDistributionWebhook(raw:Uint8Array,headers:Headers){
  const secret=process.env.DNM_WEBHOOK_SECRET || process.env.DIRENOTE_WEBHOOK_SECRET || '';
  if(!verifyDistributionSignature(raw,headers.get('DNM-Signature')||'',secret))throw Error('Invalid signature.');
  const event=eventSchema.parse(JSON.parse(Buffer.from(raw).toString('utf8')));
  if(headers.get('DNM-Event-Id')!==event.id || headers.get('DNM-Event-Type')!==event.type)throw Error('Event headers do not match.');
  const digest=createHash('sha256').update(raw).digest('hex');
  const data=JSON.parse(JSON.stringify(redactDireNoteDiagnostic(event)));
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${event.id}, 7212))`;
    const existing=await tx.auditLog.findFirst({where:{entity:'distribution_webhook',entityId:event.id}});
    if(existing){if(object(existing.metadata).digest!==digest)throw Error('Event ID payload conflict.');return {duplicate:true,id:existing.id};}
    const saved=await tx.auditLog.create({data:{action:knownTypes.includes(event.type)?'DISTRIBUTION_WEBHOOK_RECEIVED':'DISTRIBUTION_WEBHOOK_IGNORED',entity:'distribution_webhook',entityId:event.id,metadata:{digest,event:data,attempts:0}}});
    return {duplicate:false,id:saved.id};
  },{timeout:8000,maxWait:2000});
}

async function reconcileEvent(event:Record<string,any>){
  const data=object(event.data),type=String(event.type);
  if(type.startsWith('metadata_request.')){
    const requestId=Number(data.request_id);if(!Number.isSafeInteger(requestId)||requestId<1)throw Error('Request identity missing.');
    const rows=await prisma.releaseChangeRequest.findMany({where:{providerReference:{in:[`service:${requestId}`,`support:${requestId}`]}},take:2});
    if(rows.length!==1)throw Error('Request identity is not uniquely linked.');
    if(rows[0].requestType==='distribution_service')await syncDistributionService(rows[0].id);else await syncSupportCorrection(rows[0].id);
    return;
  }
  if(type.startsWith('video.')){
    const upc=String(data.video_upc||data.upc_code||'');
    const receipt=await prisma.releaseChangeRequestEvent.findMany({where:{metadata:{path:['result','video_upc'],equals:upc}},select:{requestId:true},take:3});
    const ids=[...new Set(receipt.map(row=>row.requestId))];if(ids.length!==1)throw Error('Video identity is not uniquely linked.');
    await syncDistributionService(ids[0]);
    // Video job completion is not store publication; retain the signed event for staff verification.
    await createAdminTaskOnce({eventKey:`distribution-event:${event.id}`,type:'Video delivery',priority:type.endsWith('rejected')?'high':'normal',title:'Video delivery event needs verification',body:'A signed video event was received and its job was checked. Verify the requested store result before completing the service.',href:'/admin/distribution-services',entityType:'release_change_request',entityId:ids[0]});return;
  }
  if(type.startsWith('payout.')){
    const id=Number(data.payout_id||data.id);if(!Number.isSafeInteger(id)||id<1)throw Error('Payout identity missing.');
    const result=await callDistributionEndpoint('list_payouts',{payout_id:id,per_page:1});
    if(!result.success)throw Error('Payout read unavailable.');
    const rows=object(result.data).payouts;
    if(!Array.isArray(rows)||!rows.some(row=>Number(object(row).payout_id||object(row).id)===id))throw Error('Payout identity mismatch.');
    await createAdminTaskOnce({eventKey:`distribution-event:${event.id}`,type:'Distribution settlement',priority:'high',title:'Partner settlement update requires reconciliation',body:'A signed settlement event was confirmed with a partner read. Review revenue operations; customer balances were not changed.',href:'/admin?tab=revenue',entityType:'partner_payout',entityId:id});return;
  }
  if(type==='copyright_claim.created'){
    const claim=z.object({strike_id:z.number().int().positive(),claimant:z.string().trim().min(1).max(500),response_deadline_hours:z.number().int().min(1).max(720)}).passthrough().safeParse(data);
    if(!claim.success){
      await createAdminTaskOnce({eventKey:`distribution-event:${event.id}`,type:'Copyright claim',priority:'critical',title:'Copyright notice needs urgent verification',body:'A signed claim notice has invalid claimant or deadline fields. Inspect the internal event and contact the partner immediately. No artist notice with unverified details was sent.',href:'/admin/distribution-services',entityType:'distribution_webhook',entityId:event.id});
      throw Error('Copyright notice fields could not be verified.');
    }
    const upc=String(data.upc||''),isrc=String(data.isrc||'').replace(/[ -]/g,'').toUpperCase();
    const candidates=(/^\d{12,14}$/.test(upc)||/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc))?await prisma.release.findMany({where:{archivedAt:null,...(isrc?{tracks:{some:{isrc}}}:{}),...(/^\d{12,14}$/.test(upc)?{upc}:{id:{in:(await prisma.track.findMany({where:{isrc},select:{releaseId:true},take:3})).map(row=>row.releaseId)}}),distributionSubmissions:{some:{provider:'direnote',isCurrent:true,...(/^\d{12,14}$/.test(upc)?{upc}:{})}}},include:{user:true},take:2}):[];
    const release=candidates.length===1?candidates[0]:null;
    const hours=Math.max(1,Math.min(720,Number(data.response_deadline_hours)||48)),deadline=new Date(Date.parse(event.created_at)+hours*3600000).toISOString();
    await createAdminTaskOnce({eventKey:`distribution-event:${event.id}`,type:'Copyright claim',priority:'critical',title:'Copyright claim requires rights review',body:`Claim #${data.strike_id}; claimant: ${String(data.claimant||'See signed evidence')}. Response deadline: ${deadline}. ${release?'Current release identity matched.':'Release identity needs manual verification.'} Review the signed event and rights documents immediately.`,href:release?`/admin?tab=releases&release=${release.id}`:'/admin/distribution-services',entityType:release?'release':'distribution_webhook',entityId:release?.id||event.id});
    if(release && release.user.status==='ACTIVE'){
      const eventKey=`distribution-claim:${event.id}`,path=`/dashboard/releases/${release.id}?tab=requests`;
      const displayDeadline=new Date(deadline).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})+' IST';
      const model={title:'A rights claim needs your attention',greeting:`Hi ${release.user.name||'there'},`,body:`HYMN received a rights claim concerning “${release.title}”. Claimant: ${String(data.claimant||'See your HYMN review')}. Please contact HYMN with your rights documentation before ${displayDeadline}. A claim alone does not establish infringement.`,ctaLabel:'Open your release',ctaUrl:`${getPublicAppUrl()}${path}`,preserveNames:[release.artistName,release.title,String(data.claimant||''),String(data.claimant_artist||'')]};
      await prisma.$transaction(async tx=>{
        await tx.notification.upsert({where:{eventKey},update:{},create:{eventKey,userId:release.userId,title:model.title,body:model.body,type:'release',priority:'high',href:path,actionLabel:'Review claim'}});
        await tx.emailLog.upsert({where:{eventKey:`${eventKey}:email`},update:{},create:{eventKey:`${eventKey}:email`,userId:release.userId,toEmail:release.user.email,subject:`Rights review needed · ${release.title}`,template:'copyright_claim_notice',entityType:'release',entityId:String(release.id),status:'pending',payload:{channel:'release_outbox',expectedStatus:release.status,html:emailLayout(model),text:emailText(model),preserveNames:model.preserveNames}}});
      });
    }
    return;
  }
  const upc=String(data.upc_code||data.upc||'');
  const attempts=await prisma.distributionSubmissionAttempt.findMany({where:{provider:'direnote',isCurrent:true,upc},select:{releaseId:true},take:2});
  if(!/^\d{12,14}$/.test(upc)||attempts.length!==1)throw Error('Release identity is not uniquely current.');
  const releaseId=attempts[0].releaseId;
  await syncDireNoteRelease(releaseId,null,{deadlineAt:Date.now()+12000});
}

export async function processDistributionWebhookQueue(limit=1){
  const stale=await prisma.auditLog.findMany({where:{entity:'distribution_webhook',action:'DISTRIBUTION_WEBHOOK_PROCESSING',createdAt:{lt:new Date(Date.now()-10*60000)}},take:10});
  for(const row of stale){const meta=object(row.metadata);if(Date.parse(meta.claimedAt||'')<Date.now()-10*60000)await prisma.auditLog.updateMany({where:{id:row.id,action:'DISTRIBUTION_WEBHOOK_PROCESSING'},data:{action:'DISTRIBUTION_WEBHOOK_RETRY',metadata:{...meta,nextAttemptAt:new Date().toISOString()}}});}
  const rows=await prisma.auditLog.findMany({where:{entity:'distribution_webhook',action:{in:['DISTRIBUTION_WEBHOOK_RECEIVED','DISTRIBUTION_WEBHOOK_RETRY']}},orderBy:{createdAt:'asc'},take:10});
  let processed=0;
  for(const row of rows){
    if(processed>=limit)break;
    const meta=object(row.metadata);if(meta.nextAttemptAt && Date.parse(meta.nextAttemptAt)>Date.now())continue;
    if(!(await prisma.auditLog.updateMany({where:{id:row.id,action:row.action},data:{action:'DISTRIBUTION_WEBHOOK_PROCESSING',metadata:{...meta,claimedAt:new Date().toISOString()}}})).count)continue;
    processed++;
    try{await reconcileEvent(object(meta.event));await prisma.auditLog.update({where:{id:row.id},data:{action:'DISTRIBUTION_WEBHOOK_DONE'}});}
    catch{
      const attempts=Number(meta.attempts||0)+1;
      await prisma.auditLog.update({where:{id:row.id},data:{action:attempts>=6?'DISTRIBUTION_WEBHOOK_REVIEW':'DISTRIBUTION_WEBHOOK_RETRY',metadata:{...meta,attempts,nextAttemptAt:new Date(Date.now()+Math.min(3600000,60000*2**attempts)).toISOString()}}});
      if(attempts>=6)await createAdminTaskOnce({eventKey:`distribution-event-review:${row.id}`,type:'Distribution webhook',priority:'high',title:'Distribution event could not be reconciled',body:'Six read-only reconciliation attempts failed. Inspect the event identity and partner configuration; no provider write was repeated.',href:'/admin/distribution-services',entityType:'distribution_webhook',entityId:row.id});
    }
  }
  return processed;
}
