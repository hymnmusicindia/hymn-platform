import 'server-only';
import { OAC_RETRY_PLAN, OAC_RETRY_AMOUNT, oacOutcome } from './youtube-oac-contract';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { serviceRequest, parseServiceFields, distributionServices, activeServiceStates, object, normalizeClaimLink, type DistributionServiceAction } from './distribution-services-contract';
import { postToDireNote } from './direnote/direnote-client';
import { getDireNoteConfig } from './direnote/direnote-config';
import { reserveDireNoteRequest, enforceDireNoteResponseLimit,isDireNoteRateLimit } from './direnote-rate-limit';
import { customerBrandText } from './customer-message';
import { redactDireNoteDiagnostic } from './direnote';
import { enqueueAmendmentUpdate, amendmentTransactionOptions } from './release-amendment-notifications';
import { createAdminTaskOnce, resolveAdminTask } from './task-queue';
import { attachedArtistProfileIds,savedArtistStoreLinks,verifiedArtistStoreLinks } from './artist-store-links';
import { normalizeInstagramUrl } from './validation';
import { oacArtistLiveReleases,oacArtistReleaseWhere } from './oac-artist-releases';

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export async function callDistributionEndpoint(action: string, payload: Record<string, unknown>, releaseId?: number) {
  // Callers validate the action using a fixed server-owned contract; never accept endpoint URLs.
  if (!/^[a-z_]+$/.test(action)) throw Error('Invalid operation.');
  await reserveDireNoteRequest(action,releaseId);
  const endpoint = new URL(`/${action}`,new URL(getDireNoteConfig().endpoint).origin);
  if (endpoint.protocol !== 'https:' && !['127.0.0.1','localhost'].includes(endpoint.hostname)) throw Error('HTTPS required.');
  const result = await postToDireNote(endpoint.toString(),payload,{timeoutMs:12000});
  await enforceDireNoteResponseLimit(result,releaseId);
  return result;
}

export async function buildService(releaseId: number, userId: number, input: ReturnType<typeof serviceRequest.parse>) {
  if(input.artistProfileId&&input.action!=='request_yt_oac')throw Error('Artist selection is only supported for OAC requests.');
  const release = await prisma.release.findFirstOrThrow({where:{id:releaseId,userId,archivedAt:null},include:{tracks:true,user:true,artistProfile:true}});
  if (release.user.status !== 'ACTIVE') throw Error('Your account must be active.');
  if (!['LIVE','PARTIALLY_LIVE','SCHEDULED','DISTRIBUTOR_PROCESSING'].includes(release.status)) throw Error('This service requires a delivered release.');
  const track = release.tracks.find(t=>t.id===input.trackId);
  if (!track?.isrc || !/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(track.isrc) || !/^\d{12,14}$/.test(release.upc || '')) throw Error('Confirm this release UPC and track ISRC first.');
  const fields = parseServiceFields(input.action,input.fields);
  if((input.action.endsWith('_claim')||input.action==='request_instagram_linking') && !['LIVE','PARTIALLY_LIVE'].includes(release.status))throw Error('Profile linking and claim review require a live recording.');
  const meta = object(release.metadata);
  let payload: Record<string,any> = {isrc:track.isrc};
  let resource = `track:${track.id}`;
  if (input.action === 'request_instagram_linking') payload = {...payload,instagram_url:fields.instagram_url,facebook_url:fields.facebook_url};
  if (input.action.endsWith('_claim')) payload = {...payload,url:normalizeClaimLink(input.action,fields.url)};
  if (input.action === 'request_yt_oac') {
    const attached=attachedArtistProfileIds(track.metadata,release.artistProfileId);
    const artistId=input.artistProfileId??release.artistProfileId??(attached.length===1?attached[0]:null);
    if(!artistId||!attached.includes(artistId))throw Error('Choose a primary artist linked to this recording.');
    const artist = await prisma.artistCard.findFirst({where:{id:artistId,userId,archivedAt:null}});
    if (!artist || artist.userId !== userId || artist.archivedAt || (!/^\d+$/.test(artist.direNoteArtistId || '') || !Number.isSafeInteger(Number(artist.direNoteArtistId)) || Number(artist.direNoteArtistId)<1)) throw Error('HYMN must verify the artist profile identity first.');
    const legacy=await prisma.managedServiceRequest.findFirst({where:{userId,serviceType:'YOUTUBE_OAC',release:oacArtistReleaseWhere(userId,artist.id),status:{notIn:['completed','failed','rejected','cancelled']}}});
    if(legacy)throw Error(`Existing OAC request #${legacy.id} is still active in Managed services. Track it before submitting another.`);
    if(await prisma.managedServiceRequest.count({where:{userId,serviceType:'YOUTUBE_OAC',release:oacArtistReleaseWhere(userId,artist.id),status:'completed'}}))throw Error('This artist already has an approved OAC. Request a channel change through HYMN support.');
    const unresolvedLegacy=await prisma.managedServiceRequest.count({where:{userId,serviceType:'YOUTUBE_OAC',release:oacArtistReleaseWhere(userId,artist.id),status:{in:['failed','rejected','cancelled']}}});
    if(unresolvedLegacy&&!await prisma.releaseChangeRequest.count({where:{requestedByUserId:userId,requestType:'distribution_service',requestedChanges:{path:['resource'],equals:`artist:${artist.id}`}}}))throw Error('HYMN must reconcile the earlier OAC application before another application or payment. Contact support.');
    const live = (await oacArtistLiveReleases(userId,artist.id)).length;
    if (live < 5) throw Error('An Official Artist Channel requires at least five live releases for this verified artist profile.');
    payload = {artist_id:Number(artist.direNoteArtistId),...fields}; resource = `artist:${artist.id}`;
  }
  if (input.action === 'request_takedown') {
    if (release.status !== 'LIVE') throw Error('Only fully live releases are eligible for this full-store takedown.');
    const firstLive = await prisma.releaseStatusTransition.findFirst({where:{releaseId,newStatus:'LIVE',previousStatus:{notIn:['TAKEDOWN_PROCESSING','TAKEDOWN_REQUESTED']}},orderBy:{createdAt:'desc'}});
    if (firstLive && Date.now()-firstLive.createdAt.getTime()<90*86400000) throw Error('A full-store takedown requires 90 days live. Contact HYMN if your earlier live date needs reconciliation.');
    if (fields.confirmation !== `REMOVE ${release.upc}`) throw Error('Type REMOVE followed by this release UPC to confirm all-store removal.');
    payload = {upc:release.upc,reason:input.reason}; resource = `release:${releaseId}`;
  }
  if (input.action === 'ingest_video') {
    const minimum = new Date(Date.now()+3*86400000+19800000).toISOString().slice(0,10);
    if (fields.release_date < minimum) throw Error('Video release date must be at least three days away in India time.');
    const trackMeta={...object(track.metadata),...object(object(track.metadata).metadata)};
    const primaryIds=attachedArtistProfileIds(track.metadata,release.artistProfileId);
    const featuredIds=Array.isArray(trackMeta.featuredArtistProfileIds)?trackMeta.featuredArtistProfileIds.filter((id:unknown)=>Number.isSafeInteger(id)&&Number(id)>0) as number[]:[];
    const cards=await prisma.artistCard.findMany({where:{id:{in:[...primaryIds,...featuredIds]},userId,archivedAt:null}});
    const names=(value:string)=>value.split(',').map(name=>name.trim()).filter(Boolean);
    const resolve=(name:string,ids:number[])=>{
      const matches=cards.filter(card=>ids.includes(card.id)&&card.artistName.trim().toLowerCase()===name.toLowerCase());
      if(matches.length!==1 || !matches[0].instagramUrl)throw Error(`Verify the selected artist card and Instagram identity for ${name} before video delivery.`);
      const card=matches[0],links=savedArtistStoreLinks(card),youtube=verifiedArtistStoreLinks({youtube:card.youtubeUrl}).youtube;
      return {name,instagram_url:normalizeInstagramUrl(card.instagramUrl!),...(links.spotify?{spotify_url:links.spotify.url}:{}),...(links.apple?{apple_url:links.apple.url}:{}),...(youtube?{youtube_url:youtube.url}:{})};
    };
    const primary=names(track.primaryArtist||release.artistName).map(name=>resolve(name,primaryIds));
    const featured=names(String(trackMeta.featuredArtists||'')).map(name=>resolve(name,featuredIds));
    if(!primary.length)throw Error('Select the recording artist identities before video delivery.');
    payload = {...fields,track_name:track.title,album_name:release.title,isrc:track.isrc,upc_code:release.upc,video_type:'Official Music Video',artists:primary,featuring_artists:featured,label_name:String(meta.labelName || 'HYMN Music')};
    resource = `video:${track.id}`;
  }
  if (input.action === 'register_master_work') {
    payload = {...fields,track_artist:track.primaryArtist || release.artistName,track_name:track.title,isrc:track.isrc,release_artist:release.artistName,release_title:release.title,upc:release.upc,label:String(meta.labelName || 'HYMN Music')};
    resource = `master:${track.id}:${fields.coll_start_date}:${fields.coll_end_date}`;
  }
  const locked = {releaseId,userId,upc:release.upc,trackId:track.id,isrc:track.isrc,artistProfileId:release.artistProfileId};
  return {release,track,payload,resource,locked,input:{...input,fields}};
}

export async function createDistributionService(releaseId:number,userId:number,raw:unknown) {
  const input=serviceRequest.parse(raw), built=await buildService(releaseId,userId,input);
  const fingerprint=serviceFingerprint(input,built);
  const result=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${releaseId}::integer)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${built.resource}, 7211))`;
    const current=await tx.release.findFirstOrThrow({where:{id:releaseId,userId,version:built.release.version,archivedAt:null}});
    if (current.status!==built.release.status) throw Error('Release changed. Refresh before submitting.');
    const replay=await tx.releaseChangeRequest.findFirst({where:{requestType:'distribution_service',requestedByUserId:userId,requestedChanges:{path:['requestKey'],equals:input.requestKey}}});
    if (replay) {if(object(replay.requestedChanges).fingerprint!==fingerprint)throw Error('Submission key was already used for different details.');return replay;}
    const active=await tx.releaseChangeRequest.findFirst({where:{requestType:'distribution_service',status:{in:activeServiceStates},requestedChanges:{path:['resource'],equals:built.resource}}});
    if (active) {if(object(active.requestedChanges).fingerprint===fingerprint)return active;throw Error(`Request #${active.id} is still active for this recording or artist. Track it before submitting another.`);}
    let paidOrderId:number|undefined;
    if(input.action==='request_yt_oac'){
      const history=await tx.releaseChangeRequest.findMany({where:{requestType:'distribution_service',requestedByUserId:userId,requestedChanges:{path:['resource'],equals:built.resource}},orderBy:{id:'desc'},include:{events:true}});
      if(history.some(row=>oacOutcome(row)==='approved'))throw Error('This artist already has an approved OAC. Use the channel-change support process.');
      if(history[0]&&oacOutcome(history[0])==='rejected'){
        if(!input.paymentOrderId)throw Error('A rejected OAC application requires a verified INR 80 resubmission payment. Open the OAC popup to continue.');
        const payment=await tx.distributionOrder.findUnique({where:{razorpayOrderId:input.paymentOrderId}});
        const snapshot=object(payment?.quoteSnapshot);
        if(!payment||payment.userId!==userId||payment.plan!==OAC_RETRY_PLAN||payment.amount!==OAC_RETRY_AMOUNT||payment.currency!=='INR'||payment.paymentStatus!=='paid'||!payment.razorpayPaymentId||payment.fulfilledAt||snapshot.previousRequestId!==history[0].id||snapshot.fingerprint!==fingerprint)throw Error('The OAC payment is missing, already used or does not match this application.');
        await tx.distributionOrder.update({where:{id:payment.id},data:{fulfilledAt:new Date()}});
        paidOrderId=payment.id;
      }else if(input.paymentOrderId)throw Error('No paid resubmission is needed for this application.');
    }
    const request=await tx.releaseChangeRequest.create({data:{releaseId,requestedByUserId:userId,requestType:'distribution_service',reason:input.reason,requestedChanges:json({...(paidOrderId?{oacPaymentOrderId:paidOrderId}:{}),serviceOperation:built.input,locked:built.locked,payload:built.payload,resource:built.resource,fingerprint,requestKey:input.requestKey,summary:[{label:distributionServices[input.action].label,before:`${built.track.title} · ${built.track.isrc}`,after:input.reason}]})}});
    const event=await tx.releaseChangeRequestEvent.create({data:{requestId:request.id,actorType:'user',actorId:userId,newStatus:'submitted',note:`${distributionServices[input.action].label}: submitted for HYMN review.`}});
    await enqueueAmendmentUpdate(tx,request.id,event.id);
    return request;
  },amendmentTransactionOptions);
  await createAdminTaskOnce({eventKey:`distribution-service:${result.id}`,type:'Distribution service',priority:input.action==='request_takedown'?'high':'normal',title:distributionServices[input.action].label,body:`${built.release.title}: ${input.reason}`,href:'/admin/distribution-services',entityType:'release',entityId:releaseId});
  return result;
}

async function recordState(id:number,status:string,note:string,metadata:Record<string,unknown>={},reference?:string,actorId?:number|null) {
  const result=await prisma.$transaction(async tx=>{
    const current=await tx.releaseChangeRequest.findUniqueOrThrow({where:{id}});
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${current.releaseId}::integer)`;
    const latest=await tx.releaseChangeRequest.findUniqueOrThrow({where:{id}});
    if (latest.updatedAt.getTime()!==current.updatedAt.getTime()) throw Error('Request changed concurrently. Refresh and retry.');
    if (latest.status===status && latest.adminNote===note) return latest;
    if (['completed','rejected','failed'].includes(latest.status)) return latest;
    if (status==='approved' && !['submitted','under_review'].includes(latest.status)) throw Error('Request is no longer awaiting a review decision.');
    if (status==='rejected' && !['submitted','under_review','approved'].includes(latest.status)) throw Error('A dispatched request cannot be declined before its outcome is reconciled.');
    if (status==='rejected' && await tx.releaseChangeRequestEvent.findFirst({where:{requestId:id,metadata:{path:['serviceWrite'],equals:true}}}))throw Error('A send was recorded. Reconcile it instead of closing an uncertain outcome.');
    if(['submitted_to_partner','completed'].includes(status)){
      const locked=object(object(latest.requestedChanges).locked);
      const release=await tx.release.findUniqueOrThrow({where:{id:latest.releaseId}});
      const track=await tx.track.findFirst({where:{id:Number(locked.trackId),releaseId:latest.releaseId}});
      if(release.archivedAt || release.userId!==latest.requestedByUserId || release.upc!==locked.upc || release.artistProfileId!==locked.artistProfileId || track?.isrc!==locked.isrc)throw Error('Recording identity or ownership changed. Reconcile before recording this outcome.');
    }
    const updated=await tx.releaseChangeRequest.update({where:{id},data:{status,adminNote:note,...(reference?{providerReference:reference}:{}),...(status==='completed'?{completedAt:new Date()}:{})}});
    const event=await tx.releaseChangeRequestEvent.create({data:{requestId:id,actorType:actorId?'admin':'system',actorId,previousStatus:latest.status,newStatus:status,note,metadata:json(metadata)}});
    const operation=object(object(latest.requestedChanges).serviceOperation);
    if(operation.action==='request_takedown' && ['submitted_to_partner','completed','failed'].includes(status)){
      const release=await tx.release.findUniqueOrThrow({where:{id:latest.releaseId}});
      const previous=object(object(release.metadata).distributionTakedown),locked=object(object(latest.requestedChanges).locked);
      const mayRestore=status==='failed'&&release.status==='TAKEDOWN_PROCESSING'&&previous.requestId===id&&release.userId===latest.requestedByUserId&&release.upc===locked.upc;
      const next=status==='failed'?(mayRestore?'LIVE':release.status):status==='completed'?'TAKEN_DOWN':release.status==='TAKEN_DOWN'?'TAKEN_DOWN':'TAKEDOWN_PROCESSING';
      if(release.status!==next){
        await tx.release.update({where:{id:release.id},data:{status:next,version:{increment:1},metadata:json({...object(release.metadata),distributionTakedown:{requestId:id,status:next,updatedAt:new Date().toISOString()}})}});
        await tx.releaseStatusTransition.create({data:{releaseId:release.id,previousStatus:release.status,newStatus:next,actorType:actorId?'admin':'system',actorId,reason:note,metadata:{serviceRequestId:id}}});
      }
    }
    await enqueueAmendmentUpdate(tx,id,event.id);
    return updated;
  },amendmentTransactionOptions);
  if(result.status===status && ['completed','rejected','failed'].includes(result.status)){await resolveAdminTask(`distribution-service:${id}`,note);await resolveAdminTask(`distribution-service:${id}:sync`,note);}
  return result;
}

export async function reviewDistributionService(id:number,decision:'approve'|'reject'|'complete',note:string,actorId?:number|null) {
  if (note.trim().length<10)throw Error('Provide a detailed review note.');
  const request=await prisma.releaseChangeRequest.findFirstOrThrow({where:{id,requestType:'distribution_service'}});
  if(decision==='complete'){
    if(request.status!=='processing_manually')throw Error('Partner approval and a verified store result are required first.');
    const approval=await prisma.releaseChangeRequestEvent.findFirst({where:{requestId:id,metadata:{path:['providerApproved'],equals:true}}});
    if(!approval)throw Error('Read and confirm partner approval before completing this request.');
    const updated=await recordState(id,'completed',`HYMN verified the requested result: ${note}`,{},undefined,actorId);
    await resolveAdminTask(`distribution-service:${id}`,note);return updated;
  }
  if(!(decision==='reject'?['submitted','under_review','approved']:['submitted','under_review']).includes(request.status))throw Error('Only unsent requests can receive this review decision.');
  // Revalidate ownership, dates and the exact recording before approval.
  if(decision==='approve'){
    const changes=object(request.requestedChanges),built=await buildService(request.releaseId,request.requestedByUserId,serviceRequest.parse(changes.serviceOperation));
    if(hash(built.locked)!==hash(changes.locked)||hash(built.payload)!==hash(changes.payload))throw Error('Recording details changed. The artist must submit a fresh request.');
  }
  const updated=await recordState(id,decision==='approve'?'approved':'rejected',note,{},undefined,actorId);
  if(decision==='reject')await resolveAdminTask(`distribution-service:${id}`,note);
  return updated;
}

export async function submitDistributionService(id:number,actorId?:number|null) {
  const request=await prisma.releaseChangeRequest.findFirstOrThrow({where:{id,requestType:'distribution_service',status:'approved'}});
  const changes=object(request.requestedChanges),input=serviceRequest.parse(changes.serviceOperation),built=await buildService(request.releaseId,request.requestedByUserId,input);
  if(hash(built.locked)!==hash(changes.locked)||hash(built.payload)!==hash(changes.payload))throw Error('Recording details changed after review. Do not send.');
  // Reserve before the durable send marker, so a local capacity error is safely retryable.
  await reserveDireNoteRequest(input.action,request.releaseId,actorId);
  await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${request.releaseId}::integer)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${built.resource}, 7211))`;
    const fresh=await tx.releaseChangeRequest.findUniqueOrThrow({where:{id}});
    if(fresh.status!=='approved'||fresh.updatedAt.getTime()!==request.updatedAt.getTime())throw Error('Request is no longer approved for this send.');
    if(changes.oacPaymentOrderId){
      const payment=await tx.distributionOrder.findUnique({where:{id:Number(changes.oacPaymentOrderId)}});
      if(!payment||payment.paymentStatus!=='paid'||payment.userId!==request.requestedByUserId)throw Error('OAC resubmission payment requires review before sending.');
    }
    const write=await tx.releaseChangeRequestEvent.findFirst({where:{requestId:id,metadata:{path:['serviceWrite'],equals:true}}});
    if(write)throw Error('A send is already recorded. Reconcile its outcome instead of resending.');
    const other=await tx.releaseChangeRequestEvent.findFirst({where:{requestId:{not:id},request:{releaseId:request.releaseId,status:{in:activeServiceStates}},AND:[{metadata:{path:['supportWrite'],equals:true}},{metadata:{path:['isrc'],equals:built.track.isrc!}}]}});
    if(other)throw Error('Another request for this recording has an unresolved partner send.');
    const release=await tx.release.findUniqueOrThrow({where:{id:request.releaseId},select:{version:true,userId:true,status:true,archivedAt:true}});
    const track=await tx.track.findFirst({where:{id:built.track.id,releaseId:request.releaseId}});
    const owner=await tx.user.findUnique({where:{id:request.requestedByUserId},select:{status:true}});
    if(release.version!==built.release.version || release.userId!==request.requestedByUserId || release.archivedAt || release.status!==built.release.status || track?.isrc!==built.track.isrc || owner?.status!=='ACTIVE')throw Error('Release or owner changed before sending.');
    await tx.releaseChangeRequestEvent.create({data:{requestId:id,actorType:'admin',actorId,previousStatus:'approved',newStatus:'processing_manually',note:'HYMN submission started. Awaiting a verified partner receipt.',metadata:{serviceWrite:true,supportWrite:true,action:input.action,isrc:built.track.isrc}}});
    await tx.releaseChangeRequest.update({where:{id},data:{status:'processing_manually',adminNote:'Submission outcome is awaiting verification. Do not resend.'}});
  },amendmentTransactionOptions);
  const payload={...built.payload,...(input.action==='ingest_video'?{idempotency_key:`hymn-video-service-${id}`}:{})};
  let response;
  try {
    const endpoint=new URL(`/${input.action}`,new URL(getDireNoteConfig().endpoint).origin);
    if(endpoint.protocol!=='https:' && !['localhost','127.0.0.1'].includes(endpoint.hostname))throw Error('HTTPS required.');
    response=await postToDireNote(endpoint.toString(),payload,{timeoutMs:15000});
    try{await enforceDireNoteResponseLimit(response,request.releaseId);}catch(error){if(!isDireNoteRateLimit(error))throw error;}
  } catch {
    return recordState(id,'processing_manually','HYMN could not confirm the submission outcome. Staff must reconcile it before any further send.');
  }
  await prisma.direNoteLog.create({data:{releaseId:request.releaseId,action:`service_${input.action}`,success:response.success,httpStatus:response.httpStatus,requestPayloadRedacted:{serviceRequestId:id},responseJson:json(redactDireNoteDiagnostic(response.data || {}))}});
  if(!response.success && [400,401,403,404,405,413,422,429].includes(response.httpStatus||0))return recordState(id,'failed',`The submission was not accepted. ${customerBrandText(String(redactDireNoteDiagnostic(response.error||'HYMN will review the validation or access issue before a fresh request is submitted.')).slice(0,1500))}`,{providerFailed:true,httpStatus:response.httpStatus});
  const data=object(response.data),receipt=object(data.request),work=object(data.work);
  let reference='';
  if(response.success && input.action==='ingest_video' && typeof data.job_id==='string' && /^[\w-]{1,128}$/.test(data.job_id))reference=`video:${data.job_id}`;
  else if(response.success && input.action==='register_master_work' && Number.isSafeInteger(Number(work.work_id)) && Number(work.work_id)>0 && work.isrc===built.track.isrc && work.status==='pending' && work.coll_start_date===built.payload.coll_start_date && work.coll_end_date===built.payload.coll_end_date && work.claim===built.payload.claim && Number(work.claim_percent)===built.payload.claim_percent)reference=`master:${work.work_id}`;
  else if(response.success && Number.isSafeInteger(Number(receipt.request_id)) && Number(receipt.request_id)>0 && receipt.status==='pending')reference=`service:${receipt.request_id}`;
  if(reference)return recordState(id,'submitted_to_partner','HYMN received the partner receipt. The requested outcome is still pending.',{receipt: true},reference);
  // No receipt means uncertainty, even on a 4xx. No blind retries of writes.
  return recordState(id,'processing_manually','The partner receipt could not be verified. HYMN will reconcile this request before any further send.',{httpStatus:response.httpStatus});
}

export async function syncDistributionService(id:number) {
  const request=await prisma.releaseChangeRequest.findFirstOrThrow({where:{id,requestType:'distribution_service'}}),changes=object(request.requestedChanges),input=serviceRequest.parse(changes.serviceOperation);
  if(!['submitted_to_partner','processing_manually'].includes(request.status))return request;
  const reference=request.providerReference || '';
  const action:DistributionServiceAction=input.action;
  let endpoint='list_support_requests',payload:Record<string,unknown>={request_id:Number(reference.slice(8)),per_page:1};
  if(action==='ingest_video'){endpoint='video_status';payload=reference.startsWith('video:')?{job_id:reference.slice(6)}:{idempotency_key:`hymn-video-service-${id}`};}
  else if(action==='register_master_work'){endpoint='master_work_status';payload=reference.startsWith('master:')?{work_id:Number(reference.slice(7))}:{isrc:object(changes.locked).isrc};}
  else if(!/^service:\d+$/.test(reference))return request; // Unknown receipt: manual reconciliation, never a guessed request ID.
  const response=await callDistributionEndpoint(endpoint,payload,request.releaseId);
  if(!response.success)throw Error('HYMN status lookup is temporarily unavailable. No submission was repeated.');
  const data=object(response.data),locked=object(changes.locked);
  if(action==='ingest_video'){
    if(reference && data.job_id!==reference.slice(6) || data.idempotency_key && data.idempotency_key!==`hymn-video-service-${id}`)throw Error('Video job identity mismatch.');
    if(!reference && data.idempotency_key!==`hymn-video-service-${id}` || typeof data.job_id!=='string' || !/^[\w-]{1,128}$/.test(data.job_id))throw Error('Video job could not be bound to the submission key.');
    if(data.status==='failed')return recordState(id,'failed',`Video processing failed. ${customerBrandText(String(redactDireNoteDiagnostic(data.error||'Review the video file requirements.')).slice(0,1500))}`,{providerFailed:true});
    const result=object(data.result);
    if(data.status==='completed'){
      if(!/^(?:IN-DN3-\d{2}-\d{5}|INDN3\d{7})$/.test(String(result.video_isrc))||!/^\d{13}$/.test(String(result.video_upc)) || result.video_title!==object(changes.payload).video_title || result.release_date!==object(changes.payload).release_date)throw Error('Video identifiers or submitted metadata are not verified.');
      return recordState(id,'processing_manually',`Video processing completed. Video ISRC: ${result.video_isrc}; video UPC: ${result.video_upc}. Store delivery is awaiting verification.`,{providerApproved:true,result:json(result)},`video:${data.job_id}`);
    }
    if(['queued','processing'].includes(data.status))return recordState(id,'submitted_to_partner',`Video processing: ${data.status}. ${customerBrandText(String(redactDireNoteDiagnostic(data.progress||'Waiting for processing.')).slice(0,300))}`,{jobStatus:data.status},`video:${data.job_id}`);
  }else if(action==='register_master_work'){
    const rows=Array.isArray(data.works)?data.works.map(object):[];
    const matches=rows.filter(row=>row.isrc===locked.isrc && row.coll_start_date===input.fields.coll_start_date && row.coll_end_date===input.fields.coll_end_date && row.claim===input.fields.claim && Number(row.claim_percent)===input.fields.claim_percent && (!reference || Number(row.work_id)===Number(reference.slice(7))));
    if(matches.length!==1)throw Error('Collection work could not be uniquely bound to this request.');
    if(matches[0].status==='published')return recordState(id,'completed','The master collecting bodies published this registration. Collection does not guarantee earnings.',{providerApproved:true},`master:${matches[0].work_id}`);
    if(matches[0].status==='rejected')return recordState(id,'failed','The collection registration was declined. Review the rights and collection-period details.',{providerFailed:true});
    if(matches[0].status==='pending')return recordState(id,'submitted_to_partner','The master collection registration is awaiting review. Your authorized share and collection period remain as submitted.',{},`master:${matches[0].work_id}`);
  }else{
    const rows=Array.isArray(data.requests)?data.requests.map(object):[];
    const row=rows.find(row=>Number(row.request_id)===Number(reference.slice(8)));
    const expectedTypes:Partial<Record<DistributionServiceAction,string>>={request_takedown:'takedown',request_yt_oac:'YT OAC',request_instagram_linking:'Instagram Profile Linking',request_yt_claim:'YT Claim Release',request_facebook_claim:'Facebook Claim Release',request_tiktok_claim:'TikTok Claim Release',request_soundcloud_claim:'SoundCloud Claim Release'};
    if(!row || String(row.request_type||'').toLowerCase()!==expectedTypes[action]?.toLowerCase() || (action==='request_takedown'?String(row.upc||row.upc_code)!==locked.upc:action==='request_yt_oac'?row.artist_id!==undefined && Number(row.artist_id)!==Number(object(changes.payload).artist_id):String(row.isrc)!==locked.isrc))throw Error('Partner request identity mismatch.');
    if(action.endsWith('_claim') && (!row.url || normalizeClaimLink(action,String(row.url))!==object(changes.payload).url))throw Error('Claim URL does not match the submitted request.');
    if(row.status==='rejected')return recordState(id,'failed',`The request was declined. ${customerBrandText(String(row.notes||row.remarks||'HYMN will review the recorded outcome.').slice(0,1500))}`,{providerFailed:true,providerRejected:true,providerNote:String(row.notes||row.remarks||'').slice(0,2000)});
    if(row.status==='approved')return recordState(id,'processing_manually','The partner approved the request. HYMN is verifying the actual result before marking it complete.',{providerApproved:true});
  }
  return request;
}

/** Recover a missing receipt using exact stored intent. This performs reads only. */
export async function reconcileDistributionService(id:number){
  const request=await prisma.releaseChangeRequest.findFirstOrThrow({where:{id,requestType:'distribution_service',status:'processing_manually'}});
  if(request.providerReference)return syncDistributionService(id);
  const changes=object(request.requestedChanges),input=serviceRequest.parse(changes.serviceOperation),payload=object(changes.payload),locked=object(changes.locked);
  const write=await prisma.releaseChangeRequestEvent.findFirst({where:{requestId:id,metadata:{path:['serviceWrite'],equals:true}}});
  if(!write)throw Error('No submission was recorded for this request.');
  if(['ingest_video','register_master_work'].includes(input.action))return syncDistributionService(id);
  const types:Record<string,string>={request_takedown:'takedown',request_instagram_linking:'Instagram Profile Linking',request_yt_oac:'YT OAC',request_yt_claim:'YT Claim Release',request_facebook_claim:'Facebook Claim Release',request_tiktok_claim:'TikTok Claim Release',request_soundcloud_claim:'SoundCloud Claim Release'};
  const result=await callDistributionEndpoint('list_support_requests',{request_type:types[input.action],...(input.action==='request_takedown'?{upc:locked.upc}:{isrc:locked.isrc}),per_page:25,order:'desc'},request.releaseId);
  if(!result.success)throw Error('Receipt lookup is temporarily unavailable.');
  const rows=Array.isArray(object(result.data).requests)?object(result.data).requests.map(object):[];
  const matches=rows.filter((row:Record<string,any>)=>{
    if(String(row.request_type||'').toLowerCase()!==types[input.action].toLowerCase()||!Number.isSafeInteger(Number(row.request_id))||Number(row.request_id)<1)return false;
    if(input.action==='request_takedown')return row.upc===locked.upc && row.reason===payload.reason;
    if(input.action==='request_yt_oac')return Number(row.artist_id)===payload.artist_id && row.channel_id===payload.channel_id;
    if(row.isrc!==locked.isrc)return false;
    if(input.action==='request_instagram_linking')return row.instagram_url===payload.instagram_url && row.facebook_url===payload.facebook_url;
    try{return Boolean(row.url)&&normalizeClaimLink(input.action,row.url)===payload.url;}catch{return false;}
  });
  if(matches.length!==1)throw Error('A unique receipt could not be proved from returned fields. Contact partner support with the internal request audit; do not resend.');
  return recordState(id,'submitted_to_partner','HYMN recovered the existing receipt using an exact recording and request match. No submission was repeated.',{reconciled:true},`service:${matches[0].request_id}`);
}

export async function processDistributionServiceQueue(limit=2) {
  const candidates=await prisma.releaseChangeRequest.findMany({where:{requestType:'distribution_service',status:{in:['submitted_to_partner','processing_manually']},events:{none:{metadata:{path:['providerApproved'],equals:true}}}},orderBy:{updatedAt:'asc'},take:25});
  const rows=candidates.filter(row=>Date.now()-row.updatedAt.getTime()>(object(object(row.requestedChanges).serviceOperation).action==='ingest_video'?30000:15*60000)).slice(0,limit);
  for(const row of rows){try{await syncDistributionService(row.id);}catch{await createAdminTaskOnce({eventKey:`distribution-service:${row.id}:sync`,type:'Distribution service',priority:'high',title:'Service status needs verification',body:'The status read could not be matched or completed. Inspect the recorded receipt; do not repeat the write.',href:'/admin/distribution-services',entityType:'release',entityId:row.releaseId});}finally{await prisma.releaseChangeRequest.updateMany({where:{id:row.id,status:{in:['submitted_to_partner','processing_manually']}},data:{updatedAt:new Date()}});}}
  return rows.length;
}

export function serviceFingerprint(input:ReturnType<typeof serviceRequest.parse>,built:Awaited<ReturnType<typeof buildService>>){return hash({action:input.action,locked:built.locked,fields:built.input.fields,reason:input.reason});}
