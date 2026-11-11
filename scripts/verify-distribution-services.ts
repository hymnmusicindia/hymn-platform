import {confirmDistributionPayment,receiveRazorpayEvent,processRazorpayEvent,claimDistributionOrderForSubmission} from '../lib/payment-webhooks';
import {oacArtistState,prepareOacApplication,fulfillOacRetryPayment,requestOacChannelChange} from '../lib/youtube-oac';
import {oacChannelUrl,OAC_RETRY_PLAN,oacOutcome} from '../lib/youtube-oac-contract';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {NextResponse} from 'next/server';
import {randomUUID,createHmac} from 'node:crypto';
import {prisma} from '../lib/prisma';
import {buildService,createDistributionService,reviewDistributionService,submitDistributionService,syncDistributionService,reconcileDistributionService} from '../lib/distribution-services';
import {analyticsActions,serviceActions,parseServiceFields} from '../lib/distribution-services-contract';
import {readDistributionAnalytics,readCustomerSmartLink,readCustomerReference,verifyAnalyticsScope,safeAnalytics} from '../lib/distribution-insights';
import {receiveDistributionWebhook,verifyDistributionSignature,processDistributionWebhookQueue} from '../lib/distribution-webhooks';
import {reviewReleaseChangeRequest} from '../lib/release-change-requests';
async function main(){
 assert.match(process.env.DATABASE_URL||'',/^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55473\//);
 process.env.DIRENOTE_CLIENT_ID='service-client';process.env.DIRENOTE_API_PIN='service-pin';process.env.DNM_WEBHOOK_SECRET='fixture-webhook-signing-secret';
 const user=await prisma.user.create({data:{googleId:'services-user',name:'Service artist',email:'services@example.test',status:'ACTIVE'}});
 const stranger=await prisma.user.create({data:{googleId:'services-other',name:'Other artist',email:'stranger-services@example.test',status:'ACTIVE'}});
 const artist=await prisma.artistCard.create({data:{userId:user.id,artistName:'Service Artist',direNoteArtistId:'909',instagramUrl:'https://instagram.com/serviceartist'}});
 const release=await prisma.release.create({data:{userId:user.id,artistProfileId:artist.id,title:'Services release',artistName:'Service Artist',genre:'Pop',releaseDate:new Date('2025-01-01'),status:'LIVE',upc:'012345678905',tracks:{create:{trackNumber:1,title:'Service track',primaryArtist:'Service Artist',isrc:'USAAA2600001',audioUrl:'/original.wav'}}},include:{tracks:true}});
 const trackId=release.tracks[0].id;
 for(let i=0;i<4;i++)await prisma.release.create({data:{userId:user.id,artistProfileId:artist.id,title:`Other live ${i}`,artistName:'Service Artist',genre:'Pop',releaseDate:new Date('2025-01-01'),status:'LIVE'}});

 // Older wizard releases store primary artist associations in track metadata, not release.artistProfileId.
 const linkedArtist=await prisma.artistCard.create({data:{userId:user.id,artistName:'Metadata Artist',direNoteArtistId:'910'}});
 const makeLinked=(title:string,status:any='LIVE',owner=user.id,meta:any={metadata:{artistProfileIds:[linkedArtist.id]}})=>prisma.release.create({data:{userId:owner,title,artistName:'Metadata Artist',genre:'Pop',releaseDate:new Date('2025-01-01'),status,upc:'012345678906',tracks:{create:[{trackNumber:1,title:'Metadata recording',primaryArtist:'Metadata Artist',isrc:'USAAA2600010',metadata:meta},{trackNumber:2,title:'Second recording',primaryArtist:'Metadata Artist',isrc:'USAAA2600011',metadata:meta}]}},include:{tracks:true}});
 for(let i=0;i<4;i++)await makeLinked(`Metadata live ${i}`,'LIVE',user.id,i%2?{artistProfileIds:[linkedArtist.id]}:{metadata:{artistProfileIds:[linkedArtist.id]}});
 await makeLinked('Draft does not count','DRAFT');await makeLinked('Partially live does not count','PARTIALLY_LIVE');await makeLinked('Foreign owner does not count','LIVE',stranger.id);await makeLinked('Featured credit does not count','LIVE',user.id,{featuredArtistProfileIds:[linkedArtist.id]});
 const archivedLinked=await makeLinked('Archived does not count');await prisma.release.update({where:{id:archivedLinked.id},data:{archivedAt:new Date()}});
 assert.equal((await oacArtistState(user.id,linkedArtist.id)).liveCount,4,'Count canonical track links once per release, excluding non-live, archived, foreign and featured-only releases.');
 assert.equal((await oacArtistState(user.id,linkedArtist.id)).eligible,false);
 const fifthLinked=await makeLinked('Fifth metadata-linked release');
 assert.equal((await oacArtistState(user.id,linkedArtist.id)).eligible,true);
 const metadataApplication=await prepareOacApplication(user.id,{artistId:linkedArtist.id,channelUrl:'https://www.youtube.com/channel/UC0123456789012345678901',reason:'I own this artist channel and authorize its application.',rightsConfirmed:true,requestKey:randomUUID()});
 assert.equal(metadataApplication.releaseId,fifthLinked.id);assert.equal(metadataApplication.operation.artistProfileId,linkedArtist.id);
 await assert.rejects(buildService(fifthLinked.id,user.id,{...metadataApplication.operation,artistProfileId:artist.id}),/primary artist linked/);
 await prisma.releaseStatusTransition.create({data:{releaseId:release.id,previousStatus:'DISTRIBUTOR_PROCESSING',newStatus:'LIVE',actorType:'system',createdAt:new Date(Date.now()-100*86400000)}});
 const spotify={spotifyTrackUrl:'https://open.spotify.com/track/0123456789012345678901',spotifyLiveConfirmed:true};
 const future=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
 const fields:Record<string,any>={
 request_instagram_linking:{...spotify,instagram_url:'https://instagram.com/serviceartist',facebook_url:'https://facebook.com/serviceartist'},
 request_yt_oac:{channel_url:'https://www.youtube.com/channel/UC0123456789012345678901',channel_id:'UC0123456789012345678901'},
 request_yt_claim:{...spotify,url:'https://youtu.be/01234567890'},request_facebook_claim:{...spotify,url:'https://facebook.com/artist/videos/123456'},request_tiktok_claim:{...spotify,url:'https://tiktok.com/@artist/video/123456'},request_soundcloud_claim:{...spotify,url:'https://soundcloud.com/artist/track'},
 ingest_video:{video_title:'Official video',video_url:'https://cdn.example.com/video.mp4',thumbnail_url:'https://cdn.example.com/thumbnail.jpg',audio_url:'https://cdn.example.com/audio.mp3',metadata_language:'English',video_language:'English',genre:'Pop',subgenre:'Other',release_date:future,tags:'official,video',video_description:'The official video.',c_line:'2026 Service Artist',p_line:'2026 Service Artist'},
 register_master_work:{claim:'Authorized Collection Designee',claim_percent:50,coll_start_date:'2026-11-01',coll_end_date:'2027-11-01'},request_takedown:{confirmation:'REMOVE 012345678905'}};
 const make=(action:string,extra:any={})=>({action,trackId,reason:'Please review this authorized service request.',rightsConfirmed:true,fields:fields[action],requestKey:randomUUID(),...extra});
 await assert.rejects(createDistributionService(release.id,stranger.id,make('request_instagram_linking')));
 await assert.rejects(createDistributionService(release.id,user.id,make('request_instagram_linking',{trackId:999999})));
 await assert.rejects(createDistributionService(release.id,user.id,make('request_yt_claim',{rightsConfirmed:false})));
 assert.throws(()=>parseServiceFields('request_yt_claim',{...fields.request_yt_claim,url:'https://youtube.com.evil.example/video'}));
 assert.throws(()=>parseServiceFields('ingest_video',{...fields.ingest_video,video_url:'https://127.0.0.1/private'}));
 assert.throws(()=>parseServiceFields('request_yt_oac',{...fields.request_yt_oac,channel_id:'UC1123456789012345678901'}));
 assert.throws(()=>parseServiceFields('request_facebook_claim',{...fields.request_facebook_claim,url:'https://facebook.com/'}));
 assert.throws(()=>parseServiceFields('request_tiktok_claim',{...fields.request_tiktok_claim,url:'https://tiktok.com/@artist'}));
 assert.throws(()=>parseServiceFields('ingest_video',{...fields.ingest_video,genre:'Made-up genre'}));
 assert.throws(()=>parseServiceFields('register_master_work',{...fields.register_master_work,claim_percent:101}));
 assert.throws(()=>parseServiceFields('register_master_work',{...fields.register_master_work,coll_end_date:'2025-01-01'}));
 await assert.rejects(createDistributionService(release.id,user.id,make('ingest_video',{fields:{...fields.ingest_video,release_date:'2020-01-01'}})));
 let requests=0,reads=0,receiptId=100,receiptState='approved',uncertain=false,leak=false,rateLimit=false,rejectHTTP=0;
 const receiptActions=new Map<number,string>();const receiptPayloads=new Map<number,any>();
 const typeNames:Record<string,string>={request_instagram_linking:'Instagram Profile Linking',request_yt_oac:'YT OAC',request_yt_claim:'YT Claim Release',request_facebook_claim:'Facebook Claim Release',request_tiktok_claim:'TikTok Claim Release',request_soundcloud_claim:'SoundCloud Claim Release',request_takedown:'takedown'};const originalFetch=global.fetch;
 global.fetch=async(url,init)=>{
  const endpoint=new URL(String(url)).pathname.slice(1),body=JSON.parse(String(init?.body));assert.equal(body.client_id,'service-client');assert.equal(body.pin,'service-pin');
  if(rateLimit)return Response.json({success:false,message:'slow down'},{status:429,headers:{'Retry-After':'300'}});
  if(serviceActions.includes(endpoint as any)){
   requests++;if(rejectHTTP)return Response.json({success:false,error:'The required service details were not accepted.'},{status:rejectHTTP});if(uncertain)throw Error('Simulated uncertain network outcome');
   if(endpoint==='ingest_video'){assert.match(body.idempotency_key,/hymn-video-service-/);assert.equal(body.isrc,'USAAA2600001');return Response.json({success:true,job_id:'video-fixture-job',status:'queued'},{status:202});}
   if(endpoint==='register_master_work')return Response.json({success:true,work:{work_id:500,isrc:'USAAA2600001',status:'pending',claim:'Authorized Collection Designee',claim_percent:50,coll_start_date:'2026-11-01',coll_end_date:'2027-11-01'}},{status:201});
   assert.equal(body.spotifyTrackUrl,undefined);assert.equal(body.spotifyLiveConfirmed,undefined);assert.equal(body.rightsConfirmed,undefined);
   receiptActions.set(++receiptId,endpoint);receiptPayloads.set(receiptId,body);return Response.json({success:true,request:{request_id:receiptId,status:'pending'}});
  }
  reads++;
  if(endpoint==='check_release_status')return Response.json({success:true,release:{upc_code:'012345678905',album_name:'Services release',status:'Live'},tracks:[{track_name:'Service track',isrc:'USAAA2600001',status:'Live'}]});
  if(endpoint==='list_payouts')return Response.json({success:true,payouts:[{payout_id:233,status:'completed'}]});
  if(endpoint==='video_status')return Response.json({success:true,job_id:'video-fixture-job',idempotency_key:body.idempotency_key,status:'completed',result:{video_isrc:'IN-DN3-26-00001',video_upc:'3473600000010',video_title:'Official video',release_date:future}});
  if(endpoint==='master_work_status')return Response.json({success:true,works:[{work_id:500,isrc:'USAAA2600001',coll_start_date:'2026-11-01',coll_end_date:'2027-11-01',claim:'Authorized Collection Designee',claim_percent:50,status:'published'}]});
  if(endpoint==='list_support_requests'){const ids=body.request_id?[body.request_id]:[...receiptActions.keys()].filter(id=>receiptActions.get(id)==='request_yt_claim');return Response.json({success:true,requests:ids.map(id=>({request_id:id,request_type:typeNames[receiptActions.get(id)!],isrc:'USAAA2600001',upc:'012345678905',artist_id:909,...receiptPayloads.get(id),status:receiptState}))});}
  if(endpoint==='get_smartlink')return Response.json({success:true,upc_code:'012345678905',smartlink:'https://dnm.link/service-release'});
  if(endpoint.startsWith('list_'))return Response.json({success:true,values:['Pop','English','Spotify'],message:'internal transport commentary'});
  if(endpoint.startsWith('revenue_'))return Response.json({success:true,currency:'USD',filters:{upc:leak?['9999999999999']:[body.upc],isrc:Array.isArray(body.isrc)?body.isrc:[body.isrc]},summary:{net_revenue:12,quantity:100,per_stream:0.12},results:[{isrc:'USAAA2600001',upc:'012345678905',track_title:'Service track',net_revenue:12}],pin:'must-not-leak',provider_comment:'must-not-leak',pagination:{page:1,has_more:false}});
  throw Error(`Unexpected endpoint ${endpoint}`);
 };
 try{
  const guest=await prisma.artistCard.create({data:{userId:user.id,artistName:'Guest Artist',instagramUrl:'https://instagram.com/guestartist'}});
  await prisma.track.update({where:{id:trackId},data:{primaryArtist:'Service Artist, Guest Artist',metadata:{artistProfileIds:[artist.id,guest.id]}}});
  const collaboration=await createDistributionService(release.id,user.id,make('ingest_video'));
  assert.deepEqual((collaboration.requestedChanges as any).payload.artists.map((row:any)=>row.name),['Service Artist','Guest Artist'],'Video delivery must preserve every verified primary artist.');
  await reviewDistributionService(collaboration.id,'reject','Fixture draft was inspected before its source credits were changed.');
  await prisma.track.update({where:{id:trackId},data:{primaryArtist:'Service Artist',metadata:{artistProfileIds:[artist.id],featuredArtistProfileIds:[guest.id],featuredArtists:'Guest Artist'}}});
  const featureVideo=await createDistributionService(release.id,user.id,make('ingest_video'));
  assert.deepEqual((featureVideo.requestedChanges as any).payload.featuring_artists.map((row:any)=>row.name),['Guest Artist']);
  await reviewDistributionService(featureVideo.id,'reject','Fixture featured credits were inspected without sending a video.');
  await prisma.track.update({where:{id:trackId},data:{primaryArtist:'Service Artist',metadata:{}}});
  for(const action of serviceActions.filter(a=>a!=='request_takedown')){
   const input=make(action),created=await createDistributionService(release.id,user.id,input);
   assert.equal((await createDistributionService(release.id,user.id,input)).id,created.id);
   await assert.rejects(createDistributionService(release.id,user.id,{...input,reason:'Changed instructions after the first submission.'}));
   await assert.rejects(submitDistributionService(created.id));
   await assert.rejects(reviewReleaseChangeRequest({id:created.id,decision:'completed',note:'Do not bypass the service workflow.'}),/dedicated/);
   await reviewDistributionService(created.id,'approve','Ownership and requested service details verified.');
   const before=requests;
   const sends=await Promise.allSettled([submitDistributionService(created.id),submitDistributionService(created.id)]);
   assert.equal(sends.filter(r=>r.status==='fulfilled').length,1);assert.equal(requests,before+1,'Concurrent sends must issue one provider write.');
   await assert.rejects(reviewDistributionService(created.id,'complete','Trying to mark receipt as completion.'));
   const synced=await syncDistributionService(created.id);
   assert.equal(synced.status,action==='register_master_work'?'completed':'processing_manually');
   if(action!=='register_master_work')await reviewDistributionService(created.id,'complete','Verified the requested outcome on the actual store.');
   assert.equal((await prisma.release.findUniqueOrThrow({where:{id:release.id}})).status,'LIVE');
  }
  // OAC is artist-scoped: reuse across releases, strict channel URLs, and paid rejected retries.
  const canonicalChannel='https://www.youtube.com/channel/UC0123456789012345678901';
  assert.equal(oacOutcome({status:'failed',events:[{metadata:{providerApproved:true}},{metadata:{providerFailed:true,providerNote:'Channel rejected'}}]}),'rejected','Current rejection outranks old approval and supports earlier rejection records.');
  assert.equal(oacOutcome({status:'failed',events:[{metadata:{providerFailed:true}}]}),'needs_attention','Technical failures do not become paid rejections.');
  for(const invalid of ['https://youtube.com/channel/UC0123456789012345678901','https://www.youtube.com/@artist','https://youtu.be/01234567890',canonicalChannel+'?x=1',canonicalChannel+'/',canonicalChannel.replace('youtube.com','youtube.com.evil.test'),'http://www.youtube.com/channel/UC0123456789012345678901'])assert.equal(oacChannelUrl.safeParse(invalid).success,false,invalid);
  assert.equal((await oacArtistState(user.id,artist.id)).status,'approved');
  const oacInput={artistId:artist.id,channelUrl:canonicalChannel,reason:'I own this artist channel and have corrected the rejection issue.',rightsConfirmed:true as const,requestKey:randomUUID()};
  await assert.rejects(prepareOacApplication(user.id,oacInput),/approved or active/);
  await assert.rejects(oacArtistState(stranger.id,artist.id));
  const amendment={...oacInput,channelUrl:'https://www.youtube.com/channel/UC1123456789012345678901'};
  const changes=await Promise.all([requestOacChannelChange(user.id,amendment),requestOacChannelChange(user.id,amendment)]);
  assert.equal(changes[0].ticketId,changes[1].ticketId,'Channel-change submissions must reuse the active support case.');
  await assert.rejects(requestOacChannelChange(user.id,oacInput),/different channel/);
  const originalOac=await prisma.releaseChangeRequest.findFirstOrThrow({where:{releaseId:release.id,requestType:'distribution_service',requestedChanges:{path:['resource'],equals:`artist:${artist.id}`}}});
  await prisma.releaseChangeRequestEvent.deleteMany({where:{requestId:originalOac.id,metadata:{path:['providerApproved'],equals:true}}});
  await prisma.releaseChangeRequest.update({where:{id:originalOac.id},data:{status:'rejected',adminNote:'Channel ownership was not verified. Provide the correct channel-ID link.'}});
  assert.equal((await oacArtistState(user.id,artist.id)).retryAmount,80);
  const prepared=await prepareOacApplication(user.id,oacInput);
  await assert.rejects(createDistributionService(prepared.releaseId,user.id,prepared.operation),/verified INR 80/);
  const retryOrder=await prisma.distributionOrder.create({data:{userId:user.id,plan:OAC_RETRY_PLAN,amount:80,currency:'INR',razorpayOrderId:'order_oac_fixture',quoteSnapshot:{releaseId:prepared.releaseId,operation:prepared.operation,fingerprint:prepared.fingerprint,previousRequestId:originalOac.id,artistId:artist.id}}});
  await assert.rejects(fulfillOacRetryPayment(retryOrder.razorpayOrderId),/not been verified/);
  await prisma.distributionOrder.update({where:{id:retryOrder.id},data:{paymentStatus:'paid',razorpayPaymentId:'pay_oac_fixture'}});
  const paidOperation={...prepared.operation,paymentOrderId:retryOrder.razorpayOrderId};
  await assert.rejects(createDistributionService(prepared.releaseId,user.id,{...paidOperation,reason:'This payment must not fund a different application.'}),/does not match/);
  await prisma.distributionOrder.update({where:{id:retryOrder.id},data:{amount:79}});
  await assert.rejects(fulfillOacRetryPayment(retryOrder.razorpayOrderId),/not been verified/);
  await prisma.distributionOrder.update({where:{id:retryOrder.id},data:{amount:80}});
  const retries=await Promise.all([fulfillOacRetryPayment(retryOrder.razorpayOrderId),fulfillOacRetryPayment(retryOrder.razorpayOrderId)]);
  assert.equal(retries[0].id,retries[1].id,'Payment replay must create a single application.');
  await prisma.release.update({where:{id:prepared.releaseId},data:{archivedAt:new Date()}});
  assert.equal((await fulfillOacRetryPayment(retryOrder.razorpayOrderId)).id,retries[0].id,'A fulfilled payment replay must remain idempotent after its source release is archived.');
  await prisma.release.update({where:{id:prepared.releaseId},data:{archivedAt:null}});
  assert((await prisma.distributionOrder.findUniqueOrThrow({where:{id:retryOrder.id}})).fulfilledAt);
  assert.equal((await oacArtistState(user.id,artist.id)).status,'under_review');
  await assert.rejects(prepareOacApplication(user.id,{...oacInput,requestKey:randomUUID()}),/approved or active/);
  await reviewDistributionService(retries[0].id,'approve','The corrected channel and ownership documents were verified.');
  await prisma.distributionOrder.update({where:{id:retryOrder.id},data:{paymentStatus:'refunded'}});
  await assert.rejects(submitDistributionService(retries[0].id),/payment requires review/);
  await reviewDistributionService(retries[0].id,'reject','Payment was reversed before partner submission; review with support.');
  const secondPrepared=await prepareOacApplication(user.id,{...oacInput,requestKey:randomUUID()});
  const capturedOrder=await prisma.distributionOrder.create({data:{userId:user.id,plan:OAC_RETRY_PLAN,amount:80,currency:'INR',razorpayOrderId:'order_oac_captured',quoteSnapshot:{releaseId:secondPrepared.releaseId,operation:secondPrepared.operation,fingerprint:secondPrepared.fingerprint,previousRequestId:retries[0].id,artistId:artist.id}}});
  const subscription=await prisma.subscription.create({data:{userId:user.id,plan:'yearly_plus',status:'active',expiryDate:new Date(Date.now()+86400000)}});
  await assert.rejects(confirmDistributionPayment({razorpayOrderId:capturedOrder.razorpayOrderId,paymentId:'pay_oac_captured',userId:stranger.id,amountMinor:8000,currency:'INR',source:'browser'}),/authenticated user/);
  await assert.rejects(confirmDistributionPayment({razorpayOrderId:capturedOrder.razorpayOrderId,paymentId:'pay_oac_captured',userId:user.id,amountMinor:7900,currency:'INR',source:'browser'}));
  const capturePayload={id:'evt_oac_capture',event:'payment.captured',payload:{payment:{entity:{id:'pay_oac_captured',order_id:capturedOrder.razorpayOrderId,amount:8000,currency:'INR',status:'captured'}}}};
  const captureEvent=await receiveRazorpayEvent(Buffer.from(JSON.stringify(capturePayload)),capturePayload);
  await processRazorpayEvent(captureEvent.id);
  await confirmDistributionPayment({razorpayOrderId:capturedOrder.razorpayOrderId,paymentId:'pay_oac_captured',userId:user.id,amountMinor:8000,currency:'INR',source:'browser'});
  assert.equal(await prisma.releaseChangeRequest.count({where:{requestedChanges:{path:['oacPaymentOrderId'],equals:capturedOrder.id}}}),1,'Webhook/browser replay must fulfill one paid OAC application.');
  await assert.rejects(claimDistributionOrderForSubmission({razorpayOrderId:capturedOrder.razorpayOrderId,userId:user.id}),/already been used/);
  const refundPayload={id:'evt_oac_refund',event:'refund.processed',payload:{refund:{entity:{id:'rfnd_oac',payment_id:'pay_oac_captured',amount:8000,currency:'INR',status:'processed'}}}};
  await processRazorpayEvent((await receiveRazorpayEvent(Buffer.from(JSON.stringify(refundPayload)),refundPayload)).id);
  assert.equal((await prisma.distributionOrder.findUniqueOrThrow({where:{id:capturedOrder.id}})).paymentStatus,'refunded');
  assert.equal((await prisma.subscription.findUniqueOrThrow({where:{id:subscription.id}})).status,'active','An OAC fee refund must never cancel a distribution subscription.');

  assert.equal(await prisma.distributionSubmissionAttempt.count({where:{releaseId:release.id}}),0,'No audio ingestion from service requests.');
  assert((await prisma.emailLog.count({where:{userId:user.id,template:'release_amendment_update'}}))>0);
  for(const action of analyticsActions){
   const query={action,from:'2026-01',to:'2026-10',currency:'USD'};
   const result=await readDistributionAnalytics(release.id,user.id,query);assert.equal(result.data.summary.net_revenue,12);assert(!JSON.stringify(result).includes('must-not-leak'));
   const before=reads;await readDistributionAnalytics(release.id,user.id,query);assert.equal(reads,before,'Cached reporting must not consume additional provider capacity.');
  }
  await assert.rejects(readDistributionAnalytics(release.id,stranger.id,{action:'revenue_release_summary',from:'2026-01',to:'2026-10'}));
  assert.throws(()=>verifyAnalyticsScope({filters:{upc:['012345678905'],isrc:['FOREIGN']}},'012345678905',['USAAA2600001']));
  assert.equal(safeAnalytics({pin:'private',summary:{net_revenue:12,secret:'private'}}).summary.secret,undefined);
  leak=true;await assert.rejects(readDistributionAnalytics(release.id,user.id,{action:'revenue_release_summary',from:'2025-01',to:'2025-10'}),/scope/);leak=false;
  assert.equal((await readCustomerSmartLink(release.id,user.id)).url,'https://dnm.link/service-release');
  assert.deepEqual((await readCustomerReference('list_stores')).values,['Pop','English','Spotify']);
  const refused=await createDistributionService(release.id,user.id,make('request_instagram_linking'));
  await reviewDistributionService(refused.id,'approve','Verified request for definitive validation-refusal test.');
  rejectHTTP=422;assert.equal((await submitDistributionService(refused.id)).status,'failed','A definite validation refusal must not strand an active request.');rejectHTTP=0;
  await assert.rejects(readDistributionAnalytics(release.id,user.id,{action:'revenue_track_summary',trackId:999999,from:'2026-01',to:'2026-10'}));
  // A changed recording invalidates approval and can be declined safely before dispatch.
  const changed=await createDistributionService(release.id,user.id,make('request_instagram_linking'));
  await reviewDistributionService(changed.id,'approve','Profile URLs and ownership verified before approval.');
  const writesBeforeChange=requests;
  await prisma.track.update({where:{id:trackId},data:{isrc:'USAAA2600002'}});
  await assert.rejects(submitDistributionService(changed.id),/changed/);
  assert.equal(requests,writesBeforeChange);
  await reviewDistributionService(changed.id,'reject','Recording identifiers changed; submit the corrected current recording.');
  await prisma.track.update({where:{id:trackId},data:{isrc:'USAAA2600001'}});
  const legacy=await prisma.managedServiceRequest.create({data:{userId:user.id,releaseId:release.id,serviceType:'YOUTUBE_OAC',eligibilityAnswers:{},idempotencyKey:'legacy-oac-fixture'}});
  await assert.rejects(createDistributionService(release.id,user.id,make('request_yt_oac')),/Existing OAC/);
  await prisma.managedServiceRequest.update({where:{id:legacy.id},data:{status:'completed'}});
  // An uncertain write cannot be marked complete or blindly repeated.
  uncertain=true;const unknown=await createDistributionService(release.id,user.id,make('request_yt_claim'));
  await reviewDistributionService(unknown.id,'approve','Rights and claimed URL reviewed before this send.');
  assert.equal((await submitDistributionService(unknown.id)).status,'processing_manually');
  await assert.rejects(submitDistributionService(unknown.id));await assert.rejects(reviewDistributionService(unknown.id,'complete','There is still no confirmed partner approval.'));
  uncertain=false;
  const beforeRecovery=requests;
  assert.equal((await reconcileDistributionService(unknown.id)).status,'submitted_to_partner','An exact prior receipt can be recovered without another write.');
  assert.equal(requests,beforeRecovery);
  await assert.rejects(submitDistributionService(unknown.id));
  // HTTP authorization and origin boundaries use the actual route handlers.
  const require=createRequire(import.meta.url);let actor=user.id,adminAllowed=false;
  const fakeAccess={requireUser:async()=>actor?{user:{id:actor,status:'active'}}:{error:NextResponse.json({error:'Unauthorized'},{status:401})},requireAdminPermission:async()=>adminAllowed?{sub:user.id}:{error:NextResponse.json({error:'Forbidden'},{status:403})},requireRecentAdminPermission:async()=>adminAllowed?{sub:user.id}:{error:NextResponse.json({error:'Forbidden'},{status:403})}};
  function route(file:string){const exports:any={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports,URL,Request,Response,Headers,Buffer,process,require:(id:string)=>id==='@/lib/access'?fakeAccess:id==='next/server'?{NextResponse,after:()=>undefined}:id.startsWith('@/')?require('../'+id.slice(2)):require(id)});return exports;}
  const api=route('app/api/releases/[id]/services/route.ts'),context={params:Promise.resolve({id:String(release.id)})};
  process.env.APP_URL='https://hymn.fixture';process.env.NEXT_PUBLIC_APP_URL='https://hymn.fixture';
  const request=(body:any,origin='https://hymn.fixture')=>new Request('https://hymn.fixture/api/service',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await api.POST(request(make('request_instagram_linking'),'https://evil.example'),context)).status,403);
  actor=0;assert.equal((await api.GET(new Request('https://hymn.fixture'),context)).status,401);
  actor=stranger.id;assert.equal((await api.GET(new Request('https://hymn.fixture'),context)).status,404);
  actor=user.id;assert.equal((await api.GET(new Request('https://hymn.fixture'),{params:Promise.resolve({id:'not-an-id'})})).status,404);const ownedResponse=await api.GET(new Request('https://hymn.fixture'),context);assert.equal(ownedResponse.status,200);assert.match(ownedResponse.headers.get('cache-control')!,/no-store/);
  const customerRows=(await ownedResponse.json()).requests;assert(customerRows.every((row:any)=>!row.providerReference&&!row.requestedChanges.payload&&!row.requestedChanges.locked));
  const oacApi=route('app/api/distribution/oac/route.ts');
  assert.equal((await oacApi.POST(request(oacInput,'https://evil.example'))).status,403);
  actor=0;assert.equal((await oacApi.GET(new Request('https://hymn.fixture/api/distribution/oac'))).status,401);
  actor=stranger.id;assert.equal((await oacApi.GET(new Request(`https://hymn.fixture/api/distribution/oac?artistId=${artist.id}`))).status,404);
  actor=user.id;assert.equal((await oacApi.GET(new Request('https://hymn.fixture/api/distribution/oac?artistId=NaN'))).status,400);const oacResponse=await oacApi.GET(new Request(`https://hymn.fixture/api/distribution/oac?artistId=${artist.id}`));assert.equal(oacResponse.status,200);assert.match(oacResponse.headers.get('cache-control')!,/no-store/);assert(!JSON.stringify(await oacResponse.json()).includes('direNoteArtistId'));
  assert.equal((await oacApi.POST(request({action:'verify-payment',orderId:'foreign',paymentId:'foreign',signature:'a'.repeat(64)}))).status,400);
  const adminApi=route('app/api/admin/distribution-services/route.ts');assert.equal((await adminApi.GET(new Request('https://hymn.fixture'))).status,403);
  assert.equal((await adminApi.POST(request({id:unknown.id,action:'sync'}))).status,403);
  adminAllowed=true;assert.equal((await adminApi.POST(request({id:unknown.id,action:'submit',confirmation:'WRONG'}))).status,400);adminAllowed=false;
  // Signature freshness, byte integrity, concurrent replays and conflicting event IDs.
  const event={id:'evt_service_fixture',type:'future.unknown',created_at:new Date().toISOString(),data:{}};
  const raw=Buffer.from(JSON.stringify(event)),stamp=String(Math.floor(Date.now()/1000));
  const signed=(bytes:Buffer,time=stamp)=>`t=${time},v1=${createHmac('sha256',process.env.DNM_WEBHOOK_SECRET!).update(time+'.').update(bytes).digest('hex')}`;
  const headers=(bytes:Buffer,e=event)=>new Headers({'DNM-Signature':signed(bytes),'DNM-Event-Id':e.id,'DNM-Event-Type':e.type});
  assert(verifyDistributionSignature(raw,signed(raw),process.env.DNM_WEBHOOK_SECRET!));
  assert(!verifyDistributionSignature(Buffer.from('altered'),signed(raw),process.env.DNM_WEBHOOK_SECRET!));
  assert(!verifyDistributionSignature(raw,signed(raw,String(Number(stamp)-301)),process.env.DNM_WEBHOOK_SECRET!));
  assert(!verifyDistributionSignature(raw,signed(raw,String(Number(stamp)+301)),process.env.DNM_WEBHOOK_SECRET!));
  const duplicates=await Promise.all([receiveDistributionWebhook(raw,headers(raw)),receiveDistributionWebhook(raw,headers(raw))]);assert.equal(duplicates.filter(r=>r.duplicate).length,1);
  const altered=Buffer.from(JSON.stringify({...event,data:{changed:true}}));await assert.rejects(receiveDistributionWebhook(altered,headers(altered)),/conflict/);
  const mismatch=headers(raw);mismatch.set('DNM-Event-Id','evt_other');await assert.rejects(receiveDistributionWebhook(raw,mismatch));
  assert.equal(await prisma.auditLog.count({where:{entity:'distribution_webhook',entityId:event.id}}),1);
  const webhookApi=route('app/api/webhooks/direnote/route.ts');
  const invalid=await webhookApi.POST(new Request('https://hymn.fixture/api/webhooks/direnote',{method:'POST',headers:{'DNM-Signature':'invalid'},body:raw}));assert.equal(invalid.status,400);
  const large=await webhookApi.POST(new Request('https://hymn.fixture/api/webhooks/direnote',{method:'POST',body:'x'.repeat(256*1024+1)}));assert.equal(large.status,413);
  const valid=await webhookApi.POST(new Request('https://hymn.fixture/api/webhooks/direnote',{method:'POST',headers:headers(raw),body:raw}));assert.equal(valid.status,200);assert.equal((await valid.json()).duplicate,true);
  await processDistributionWebhookQueue(1);
  await prisma.distributionSubmissionAttempt.create({data:{releaseId:release.id,provider:'direnote',state:'submitted',isCurrent:true,upc:release.upc,idempotencyKey:'services-current-attempt',payloadHash:'services-fixture',trackIdentifiers:[{id:trackId,title:'Service track',isrc:'USAAA2600001',trackNumber:1}]}});
  async function deliverEvent(type:string,data:any){const e={id:'evt_'+randomUUID().replaceAll('-',''),type,created_at:new Date().toISOString(),data};const body=Buffer.from(JSON.stringify(e));await receiveDistributionWebhook(body,headers(body,e));await processDistributionWebhookQueue(1);return e;}
  const claimEvent=await deliverEvent('copyright_claim.created',{strike_id:88,isrc:'USAAA2600001',claimant:'Actual Rights Owner',response_deadline_hours:48});
  assert.equal(await prisma.emailLog.count({where:{userId:user.id,template:'copyright_claim_notice'}}),1,'Verified claims must notify the affected owner once.');
  await processDistributionWebhookQueue(1);assert.equal(await prisma.emailLog.count({where:{template:'copyright_claim_notice'}}),1);
  assert.equal((await prisma.auditLog.findFirstOrThrow({where:{entityId:claimEvent.id,entity:'distribution_webhook'}})).action,'DISTRIBUTION_WEBHOOK_DONE');
  await deliverEvent('copyright_claim.created',{strike_id:89,isrc:'USAAA2600001',claimant:{bad:'shape'},response_deadline_hours:-1});
  assert.equal(await prisma.emailLog.count({where:{template:'copyright_claim_notice'}}),1,'Malformed signed notices must alert staff without sending incorrect artist emails.');
  const delayed=await deliverEvent('release.rejected',{upc_code:release.upc,status:'rejected'});
  assert.equal((await prisma.release.findUniqueOrThrow({where:{id:release.id}})).status,'LIVE','Delayed rejected event must read current state, not overwrite it.');
  assert.equal((await prisma.auditLog.findFirstOrThrow({where:{entityId:delayed.id,entity:'distribution_webhook'}})).action,'DISTRIBUTION_WEBHOOK_DONE');
  const financialEventsBefore=await prisma.paymentWebhookEvent.count();await deliverEvent('payout.completed',{payout_id:233});assert.equal(await prisma.paymentWebhookEvent.count(),financialEventsBefore,'Distribution events do not enter payment credit handlers.');
  assert(await prisma.adminTask.count({where:{type:'Distribution settlement'}})>0);
  // Takedown consumes verified live age, changes lifecycle only on receipt and verified completion.
  await prisma.releaseChangeRequest.update({where:{id:unknown.id},data:{status:'failed'}});
  const liveTransition=await prisma.releaseStatusTransition.findFirstOrThrow({where:{releaseId:release.id,newStatus:'LIVE'},orderBy:{createdAt:'asc'}});
  await prisma.releaseStatusTransition.update({where:{id:liveTransition.id},data:{createdAt:new Date(Date.now()-89*86400000)}});
  await assert.rejects(createDistributionService(release.id,user.id,make('request_takedown')),/90 days/);
  await prisma.releaseStatusTransition.update({where:{id:liveTransition.id},data:{createdAt:new Date(Date.now()-100*86400000)}});
  await assert.rejects(createDistributionService(release.id,user.id,make('request_takedown',{fields:{confirmation:'REMOVE wrong UPC'}})),/confirm/);
  const declinedTakedown=await createDistributionService(release.id,user.id,make('request_takedown'));
  await reviewDistributionService(declinedTakedown.id,'approve','Artist confirmed removal; test a rejected partner decision.');
  await submitDistributionService(declinedTakedown.id);receiptState='rejected';
  assert.equal((await syncDistributionService(declinedTakedown.id)).status,'failed');
  assert.equal((await prisma.release.findUniqueOrThrow({where:{id:release.id}})).status,'LIVE','A declined takedown restores only its own prior live projection.');
  receiptState='approved';
  const takedown=await createDistributionService(release.id,user.id,make('request_takedown'));
  await reviewDistributionService(takedown.id,'approve','Artist explicitly confirmed full-store removal after 90 days.');
  await submitDistributionService(takedown.id);assert.equal((await prisma.release.findUniqueOrThrow({where:{id:release.id}})).status,'TAKEDOWN_PROCESSING');
  await syncDistributionService(takedown.id);await reviewDistributionService(takedown.id,'complete','Verified this release was removed from every delivered store.');
  assert.equal((await prisma.release.findUniqueOrThrow({where:{id:release.id}})).status,'TAKEN_DOWN');
  assert.equal((await prisma.track.findUniqueOrThrow({where:{id:trackId}})).isrc,'USAAA2600001');
  rateLimit=true;await assert.rejects(readDistributionAnalytics(release.id,user.id,{action:'revenue_release_summary',from:'2024-01',to:'2024-02'}));
  assert(await prisma.direNoteLog.count({where:{action:'provider_rate_limit'}})>0);
  console.log('PASS distribution services: all 9 writes and receipts, concurrent replay/send protection, ownership, review boundaries, immutable audio IDs, uncertain outcomes, 25 scoped cached analytics, smart links, references, signature freshness and webhook replay, takedown lifecycle and shared Retry-After. No real provider writes or emails.');
 }finally{global.fetch=originalFetch;}
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
