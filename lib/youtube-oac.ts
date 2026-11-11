import 'server-only';
import { prisma } from './prisma';
import { randomUUID } from 'node:crypto';
import { buildService,createDistributionService,serviceFingerprint } from './distribution-services';
import { object } from './distribution-services-contract';
import { OAC_RETRY_AMOUNT,OAC_RETRY_PLAN,oacApplication,oacChannelId,oacOutcome } from './youtube-oac-contract';
import { razorpay } from './razorpay';
import { customerBrandText } from './customer-message';
import { createAdminTaskOnce } from './task-queue';
import { oacChannelUrl } from './youtube-oac-contract';

export async function oacArtistState(userId:number,artistId:number){
  const artist=await prisma.artistCard.findFirstOrThrow({where:{id:artistId,userId,archivedAt:null,user:{status:'ACTIVE'}}});
  const [liveCount,history,legacy]=await Promise.all([
    prisma.release.count({where:{userId,artistProfileId:artistId,status:'LIVE',archivedAt:null}}),
    prisma.releaseChangeRequest.findMany({where:{requestedByUserId:userId,requestType:'distribution_service',requestedChanges:{path:['resource'],equals:`artist:${artistId}`}},orderBy:{id:'desc'},include:{events:{orderBy:{id:'desc'}}}}),
    prisma.managedServiceRequest.findMany({where:{userId,serviceType:'YOUTUBE_OAC',release:{userId,artistProfileId:artistId}},orderBy:{id:'desc'},take:30})
  ]);
  const current=history.find(row=>oacOutcome(row)==='approved')||history[0];
  const old=legacy.find(row=>row.status==='completed')||legacy.find(row=>!['failed','rejected','cancelled'].includes(row.status))||legacy[0];
  const legacyWins=old&&(!current||old.status==='completed');
  const status=legacyWins?(old.status==='completed'?'approved':['failed','rejected','cancelled'].includes(old.status)?'needs_attention':'under_review'):current?oacOutcome(current):'not_applied';
  const fields=object(object(object(current?.requestedChanges).serviceOperation).fields);
  const candidate=legacyWins?object(old.eligibilityAnswers).artistChannelUrl:fields.channel_url;
  const channelUrl=typeof candidate==='string'&&/^https:\/\/(www\.)?youtube\.com\//.test(candidate)?candidate:null;
  const verified=Boolean(artist.direNoteArtistId&&/^\d+$/.test(artist.direNoteArtistId)&&Number.isSafeInteger(Number(artist.direNoteArtistId))&&Number(artist.direNoteArtistId)>0);
  const pendingPayment=await prisma.distributionOrder.findFirst({where:{userId,plan:OAC_RETRY_PLAN,paymentStatus:'paid',fulfilledAt:null,quoteSnapshot:{path:['artistId'],equals:artistId}},select:{id:true}});
  return {artist:{id:artist.id,name:artist.artistName},status,liveCount,requiredLiveCount:5,verified,eligible:verified&&liveCount>=5,
    requestId:legacyWins?null:current?.id??null,channelUrl,
    reason:customerBrandText(legacyWins?old.rejectionReason||old.userVisibleUpdate||'':current?.adminNote||''),
    retryAmount:status==='rejected'?OAC_RETRY_AMOUNT:0,legacy:Boolean(legacyWins),paymentPending:Boolean(pendingPayment)};
}

export async function prepareOacApplication(userId:number,raw:unknown){
  const input=oacApplication.parse(raw),state=await oacArtistState(userId,input.artistId);
  if(['approved','under_review'].includes(state.status))throw Error('This artist already has an approved or active OAC application.');
  if(state.legacy)throw Error('Contact HYMN support to reconcile the earlier OAC application before applying again.');
  if(!state.eligible)throw Error(`A verified artist profile and five fully live releases are required. Current live releases: ${state.liveCount}.`);
  const release=await prisma.release.findFirst({where:{userId,artistProfileId:input.artistId,status:'LIVE',archivedAt:null,upc:{not:null},tracks:{some:{isrc:{not:null}}}},orderBy:{id:'desc'},include:{tracks:{where:{isrc:{not:null}},orderBy:{id:'asc'}}}});
  if(!release)throw Error('A live release with confirmed identifiers is required. Contact HYMN support.');
  const operation={action:'request_yt_oac' as const,trackId:release.tracks[0].id,reason:input.reason,rightsConfirmed:true as const,fields:{channel_url:input.channelUrl,channel_id:oacChannelId(input.channelUrl)},requestKey:input.requestKey};
  const built=await buildService(release.id,userId,operation);
  return {state,releaseId:release.id,operation,fingerprint:serviceFingerprint(operation,built)};
}

export async function applyForOac(userId:number,raw:unknown){
  const prepared=await prepareOacApplication(userId,raw);
  if(!prepared.state.retryAmount){const request=await createDistributionService(prepared.releaseId,userId,prepared.operation);return {requiresPayment:false,requestId:request.id};}
  if(prepared.state.paymentPending)throw Error('A paid application needs recovery. Use Resume paid application; do not pay again.');
  if(!razorpay||!process.env.RAZORPAY_KEY_ID)throw Error('Payments are temporarily unavailable. Your application has not been charged or resubmitted.');
  const order=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`artist:${prepared.state.artist.id}`},7211))`;
    const latest=await tx.releaseChangeRequest.findFirst({where:{requestedByUserId:userId,requestType:'distribution_service',requestedChanges:{path:['resource'],equals:`artist:${prepared.state.artist.id}`}},orderBy:{id:'desc'},include:{events:true}});
    if(!latest||latest.id!==prepared.state.requestId||oacOutcome(latest)!=='rejected')throw Error('Application status changed. Refresh before paying.');
    const existing=await tx.distributionOrder.findFirst({where:{userId,plan:OAC_RETRY_PLAN,paymentStatus:{in:['created','paid']},fulfilledAt:null,quoteSnapshot:{path:['fingerprint'],equals:prepared.fingerprint}},orderBy:{id:'desc'}});
    if(existing&&object(existing.quoteSnapshot).previousRequestId===latest.id)return existing;
    const provider=await razorpay!.orders.create({amount:OAC_RETRY_AMOUNT*100,currency:'INR',receipt:`oac-${randomUUID().slice(0,28)}`,notes:{purpose:OAC_RETRY_PLAN,userId:String(userId),previousRequestId:String(latest.id)}});
    return tx.distributionOrder.create({data:{userId,plan:OAC_RETRY_PLAN,amount:OAC_RETRY_AMOUNT,currency:'INR',razorpayOrderId:provider.id,quoteSnapshot:JSON.parse(JSON.stringify({releaseId:prepared.releaseId,operation:prepared.operation,fingerprint:prepared.fingerprint,previousRequestId:latest.id,artistId:prepared.state.artist.id}))}});
  },{maxWait:5000,timeout:20000});
  if(order.paymentStatus==='paid'){const request=await fulfillOacRetryPayment(order.razorpayOrderId);return {requiresPayment:false,requestId:request.id};}
  return {requiresPayment:true,orderId:order.razorpayOrderId,amount:OAC_RETRY_AMOUNT*100,currency:'INR',key:process.env.RAZORPAY_KEY_ID};
}

export async function fulfillOacRetryPayment(orderId:string){
  const order=await prisma.distributionOrder.findUniqueOrThrow({where:{razorpayOrderId:orderId}}),snapshot=object(order.quoteSnapshot);
  if(order.plan!==OAC_RETRY_PLAN||order.paymentStatus!=='paid'||order.amount!==OAC_RETRY_AMOUNT||order.currency!=='INR'||!order.razorpayPaymentId)throw Error('OAC resubmission payment has not been verified.');
  if(order.fulfilledAt)return prisma.releaseChangeRequest.findFirstOrThrow({where:{requestType:'distribution_service',requestedByUserId:order.userId,requestedChanges:{path:['oacPaymentOrderId'],equals:order.id}}});
  return createDistributionService(Number(snapshot.releaseId),order.userId,{...object(snapshot.operation),paymentOrderId:orderId});
}

export async function resumeOacPayment(userId:number,artistId:number){
  await oacArtistState(userId,artistId);
  const order=await prisma.distributionOrder.findFirstOrThrow({where:{userId,plan:OAC_RETRY_PLAN,paymentStatus:'paid',fulfilledAt:null,quoteSnapshot:{path:['artistId'],equals:artistId}},orderBy:{id:'desc'}});
  const request=await fulfillOacRetryPayment(order.razorpayOrderId);
  return {requestId:request.id};
}

export async function oacChangeInstructions(userId:number,artistId:number){
  const state=await oacArtistState(userId,artistId);
  if(state.status!=='approved')throw Error('Only an approved OAC can use the channel-change process.');
  return state;
}

export async function requestOacChannelChange(userId:number,raw:unknown){
  const input=oacApplication.parse(raw),state=await oacChangeInstructions(userId,input.artistId);
  if(state.channelUrl===input.channelUrl)throw Error('Enter a different channel for the change request.');
  const user=await prisma.user.findUniqueOrThrow({where:{id:userId},select:{email:true}});
  const ticket=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`oac-change:${input.artistId}`},7211))`;
    const existing=await tx.supportTicket.findFirst({where:{userId,category:'youtube_oac_change',status:{in:['OPEN','IN_PROGRESS']},details:{path:['artistId'],equals:input.artistId}},orderBy:{id:'desc'}});
    if(existing)return existing;
    return tx.supportTicket.create({data:{userId,subject:`OAC channel change: ${state.artist.name}`.slice(0,200),category:'youtube_oac_change',status:'OPEN',message:`Artist: ${state.artist.name}\nCurrent channel: ${state.channelUrl||'HYMN must reconcile the earlier channel'}\nRequested channel: ${oacChannelUrl.parse(input.channelUrl)}\nReason: ${input.reason}\nArtist confirms channel ownership and authorizes manual eligibility review. Do not resubmit OAC automatically: confirm the approved change process with the partner first.`,details:{artistId:input.artistId,email:user.email,requestKey:input.requestKey,currentChannelUrl:state.channelUrl,newChannelUrl:input.channelUrl}}});
  });
  await createAdminTaskOnce({eventKey:`support:${ticket.id}:open`,type:'OAC channel change',priority:'normal',title:ticket.subject,body:ticket.message,href:`/admin?tab=support&ticketId=${ticket.id}`,entityType:'support_ticket',entityId:ticket.id});
  return {ticketId:ticket.id};
}
