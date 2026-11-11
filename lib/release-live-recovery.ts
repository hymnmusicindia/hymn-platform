import 'server-only';
import { prisma } from './prisma';
import { getDireNoteReleaseInformation } from './direnote/direnote-client';
import { reserveDireNoteRequest,enforceDireNoteResponseLimit } from './direnote-rate-limit';
import { restoreFailedWizardAmendment } from './release-amendment-fulfillment';
import { createAdminTaskOnce,resolveAdminTask } from './task-queue';

const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const isrc=(v:unknown)=>String(v||'').replace(/[ -]/g,'').toUpperCase();

/** Restore only a rejected legacy re-ingestion with independent proof of its original live catalogue. */
export async function recoverLegacyLiveRelease(releaseId:number,failedAttemptId:number,actorId?:number|null){
  const release=await prisma.release.findUniqueOrThrow({where:{id:releaseId},include:{tracks:true}});
  const failed=await prisma.distributionSubmissionAttempt.findFirst({where:{id:failedAttemptId,releaseId,isCurrent:true,state:'submitted'}});
  const requestId=Number(object(failed?.responseRedacted).amendmentRequestId);
  if(!failed||!Number.isSafeInteger(requestId)||requestId<1)return false;
  const request=await prisma.releaseChangeRequest.findFirst({where:{id:requestId,releaseId,status:'submitted_to_partner'}});
  const changes=object(request?.requestedChanges),originalUpc=String(object(changes.locked).upc||'');
  if(!request||!changes.wizard_metadata||changes.supportCorrection||!/^\d{12,14}$/.test(originalUpc)||originalUpc===failed.upc)return false;
  const original=await prisma.distributionSubmissionAttempt.findFirst({where:{releaseId,upc:originalUpc,state:'submitted',isCurrent:false},orderBy:{id:'desc'}});
  if(!original)return false;
  const lookup=async(upc:string)=>{await reserveDireNoteRequest('legacy_amendment_recovery',releaseId,actorId);const result=await getDireNoteReleaseInformation(upc);await enforceDireNoteResponseLimit(result,releaseId);const data=object(result.data),tracks=Array.isArray(data.tracks)?data.tracks.map(object):[];if(!result.success||String(object(data.release).upc_code)!==upc||tracks.length!==release.tracks.length||new Set(tracks.map(t=>isrc(t.isrc))).size!==tracks.length||!tracks.length||tracks.some(t=>!release.tracks.some(own=>own.isrc&&isrc(own.isrc)===isrc(t.isrc))))throw Error('Original catalogue recovery requires an exact UPC and complete unique ISRC match.');return {data,tracks};};
  const duplicate=await lookup(failed.upc||'');
  if(!duplicate.tracks.every(t=>String(t.status).toLowerCase()==='rejected'))return false;
  const proof=await lookup(originalUpc);
  if(!proof.tracks.every(t=>String(t.status).toLowerCase()==='live'))return false;
  const now=new Date(),note='The legacy re-release was rejected as a duplicate. HYMN verified the original recording is live and restored its original UPC. Artist-profile mismatch must use Spotify content-mismatch review, not a new release.';
  await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${releaseId}::integer)`;
    const latest=await tx.release.findUniqueOrThrow({where:{id:releaseId}});
    if(latest.version!==release.version||!await tx.distributionSubmissionAttempt.count({where:{id:failed.id,isCurrent:true}}))throw Error('Release changed during live recovery. Refresh and retry.');
    await restoreFailedWizardAmendment(tx,request,{restoreContributors:false});
    await tx.distributionSubmissionAttempt.update({where:{id:failed.id},data:{isCurrent:false,providerStatus:'rejected'}});
    await tx.distributionSubmissionAttempt.update({where:{id:original.id},data:{isCurrent:true,providerStatus:'live',rawStatusPayload:proof.data,lastCheckedAt:now}});
    const restored=await tx.release.findUniqueOrThrow({where:{id:releaseId}}),metadata=object(restored.metadata);
    const date=String(object(proof.data.release).track_release_date||'');
    await tx.release.update({where:{id:releaseId},data:{upc:originalUpc,status:'LIVE',direNoteStatus:'live',direNoteSyncError:null,direNoteLastSyncedAt:now,...(/^\d{4}-\d{2}-\d{2}$/.test(date)?{releaseDate:new Date(date+'T00:00:00Z')}:{}),version:{increment:1},metadata:{...metadata,upcCode:originalUpc,...(date?{releaseDate:date}:{}),amendmentQc:{status:'closed',requestId,reason:note},direNote:{...object(metadata.direNote),currentAttemptId:original.id,status:'live',release:proof.data.release,correctionMessages:[],identifierAssignmentPending:false,reconciliationInProgress:false}}}});
    for(const track of release.tracks){const external=proof.tracks.find(t=>isrc(t.isrc)===isrc(track.isrc))!;const stored=await tx.track.findUniqueOrThrow({where:{id:track.id}});await tx.track.update({where:{id:track.id},data:{metadata:{...object(stored.metadata),direNote:{...object(object(stored.metadata).direNote),external,lastSyncedAt:now.toISOString()}}}});}
    await tx.releaseChangeRequest.update({where:{id:requestId},data:{status:'cancelled',adminNote:note}});
    await tx.releaseChangeRequestEvent.create({data:{requestId,actorType:'system',actorId,previousStatus:request.status,newStatus:'cancelled',note,metadata:{restoredAttemptId:original.id,failedAttemptId:failed.id,originalUpc,providerLiveVerified:true}}});
    await tx.releaseStatusTransition.create({data:{releaseId,previousStatus:latest.status,newStatus:'LIVE',actorType:'system',actorId,reason:note,metadata:{originalUpc,restoredAttemptId:original.id}}});
    await tx.externalIdentifierHistory.create({data:{releaseId,provider:'direnote',identifierType:'upc',previousValue:latest.upc,canonicalValue:originalUpc,source:'verified_original_live_recovery'}});
    await tx.auditLog.create({data:{actorId,action:'LEGACY_AMENDMENT_LIVE_RECOVERED',entity:'release',entityId:String(releaseId),metadata:{requestId,failedAttemptId:failed.id,restoredAttemptId:original.id,originalUpc,duplicateUpc:failed.upc,proof:proof.data}}});
  },{timeout:30000,maxWait:10000});
  await resolveAdminTask(`amendment:${requestId}:manual-qc`,note);
  await createAdminTaskOnce({eventKey:`release:${releaseId}:spotify-profile-mismatch`,type:'Artist profile mapping',priority:'high',title:`Verify Spotify profile: ${release.title}`,body:note,href:`/admin?tab=releases&releaseId=${releaseId}`,entityType:'release',entityId:releaseId});
  return true;
}
