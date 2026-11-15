import 'server-only';
import { prisma } from './prisma';
import { getDetailedReleaseById, updateDetailedReleaseStatus } from './distribution-db';
import { validateReleaseForDireNote } from './direnote-readiness';
import { hasCurrentManualQcEvidence } from './distribution-qc-evidence';

/** Persist the human decision before slow partner I/O; the existing worker owns delivery. */
export async function queueReviewedReleaseForDelivery(releaseId: number, options: { actorId: number | null; siteUrl: string; note?: string; expectedVersion?: number }) {
  return prisma.$transaction(async lock => {
    const rows = await lock.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(81422028, ${releaseId}::integer) AS locked`;
    if (!rows[0]?.locked) throw Error('Another delivery action is running. Refresh this release before trying again.');
    const release = await getDetailedReleaseById(releaseId);
    if (!release) throw Error('Release not found.');
    const ownership=await lock.release.findUniqueOrThrow({where:{id:releaseId},select:{archivedAt:true,user:{select:{status:true}}}});
    if(ownership.archivedAt||ownership.user.status!=='ACTIVE')throw Error('This release is archived or its owner is inactive. No delivery was queued.');
    if (!['under_review','approved','queued_for_distribution'].includes(release.status)) throw Error('This release must be in HYMN review before approval.');
    if (options.expectedVersion !== undefined && options.expectedVersion !== release.recordVersion) throw Error('The release changed after you opened it. Refresh and review the latest revision.');
    const unresolved = await lock.distributionSubmissionAttempt.findFirst({where:{releaseId,provider:'direnote',state:{in:['processing','reconciliation_required']}}});
    if(unresolved)throw Error('An earlier delivery is unresolved. Inspect submission history before any new request.');
    const attempt = await lock.distributionSubmissionAttempt.findFirst({ where: { releaseId, provider:'direnote', isCurrent:true }, orderBy:{id:'desc'} });
    const correction = attempt?.corrections as { status?: string } | null;
    if (attempt && (['processing','reconciliation_required','failed'].includes(attempt.state) || attempt.state === 'submitted' && correction?.status !== 'customer_resolved')) throw Error('A previous delivery already exists or needs reconciliation. Inspect its submission history; no duplicate will be sent.');
    if (release.status === 'queued_for_distribution' && hasCurrentManualQcEvidence(release) && (release.metadata?.deliveryPreparation as {state?:string}|undefined)?.state!=='needs_review') return { queued:true, submitted:false, release, retryAfterSeconds:15, message:'Approval is already saved. HYMN will continue delivery automatically; this package has not been accepted by the partner yet.' };
    if (release.paymentStatus !== 'paid') throw Error('A verified payment or entitlement is required before delivery.');
    if ([release.ownershipConfirmed,release.noUnauthorizedSamples,release.collaboratorsCredited,release.platformCompliant,release.hymnNotLiable,release.agreedToTerms,release.falseMetadataAcknowledged].some(value=>value!==true)) throw Error('Complete all ownership and legal declarations before delivery.');
    const validation = await validateReleaseForDireNote(release, { siteUrl:options.siteUrl, deferArtistLookup:true });
    if (!validation.ready) return { queued:false, submitted:false, release, validation:{ok:false,issues:validation.issues,warnings:validation.warnings}, error:validation.issues[0]?.message || 'Resolve the delivery blockers first.' };
    const queued = await updateDetailedReleaseStatus(releaseId,'queued_for_distribution',options.note || 'HYMN review approved. Partner delivery is queued.',undefined,{
      actorType:'admin',actorId:options.actorId,manualOverride:true,reviewApproval:true,reviewChanged:true,
      persist:async tx=>{
        const current=await tx.release.findUniqueOrThrow({where:{id:releaseId},include:{user:{select:{status:true}}}});
        if(current.archivedAt || current.user.status!=='ACTIVE' || current.version!==release.recordVersion)throw Error('The release or account changed during review. Refresh before approving.');
        const metadata=current.metadata as Record<string,unknown> ?? {};
        await tx.release.update({where:{id:releaseId},data:{metadata:JSON.parse(JSON.stringify({...metadata,deliveryPreparation:{state:'queued',queuedAt:new Date().toISOString(),failures:0}}))}});
      }
    });
    return { queued:true, submitted:false, release:queued, retryAfterSeconds:15, message:'HYMN approval is saved. Artist checks and partner delivery will continue automatically. Partner acceptance has not been confirmed yet.' };
  },{timeout:60000,maxWait:5000});
}

/** Reseal only an unchanged, durably audited human decision after a signing-context change.
 * Cron authentication is required by the caller; this cannot create a new human approval. */
export async function recoverQueuedReviewSignature(releaseId:number, expectedVersion:number) {
  const { manualQcPackageRevision }=await import('./distribution-qc-evidence');
  const { releaseRightsEvidence }=await import('./release-rights-evidence');
  const { resolvePrivateReleaseArtworkUrl }=await import('./release-asset-resolution');
  return prisma.$transaction(async lock=>{
    const locked=await lock.$queryRaw<Array<{locked:boolean}>>`SELECT pg_try_advisory_xact_lock(81422028, ${releaseId}::integer) AS locked`;
    if(!locked[0]?.locked)throw Error('A delivery action is active; no approval was changed.');
    const release=await getDetailedReleaseById(releaseId);
    if(!release||release.status!=='queued_for_distribution'||release.recordVersion!==expectedVersion)throw Error('The queued review version changed.');
    if(hasCurrentManualQcEvidence(release))return {recovered:false,releaseId};
    const qc=release.metadata?.manualQc as Record<string,unknown>|undefined;
    if(!qc||qc.status!=='passed'||qc.releaseId!==releaseId||qc.reviewedVersion!==expectedVersion||qc.packageRevision!==manualQcPackageRevision(release))throw Error('The queued package does not match the audited review.');
    const [transition,audit,row,attempt]=await Promise.all([
      lock.releaseStatusTransition.findFirst({where:{releaseId,newStatus:'QUEUED_FOR_DISTRIBUTION',actorType:{in:['admin','team_member']}},orderBy:{id:'desc'}}),
      lock.auditLog.findFirst({where:{entity:'release',entityId:String(releaseId),action:'RELEASE_STATUS_TRANSITION',AND:[{metadata:{path:['version'],equals:expectedVersion}},{metadata:{path:['newStatus'],equals:'queued_for_distribution'}}]},orderBy:{id:'desc'}}),
      lock.release.findUniqueOrThrow({where:{id:releaseId},include:{user:{select:{status:true}}}}),
      lock.distributionSubmissionAttempt.findFirst({where:{releaseId,provider:'direnote'}})
    ]);
    if(!transition||!audit||row.archivedAt||row.user.status!=='ACTIVE'||attempt||transition.actorId!==(qc.reviewerUserId??null)||transition.reason!==qc.reason)throw Error('No unchanged human review checkpoint is available for signature recovery.');
    const artwork=await resolvePrivateReleaseArtworkUrl({userId:release.userId,releaseId:release.id,value:release.artworkUrl},lock);
    const urls=[artwork,...(release.tracks??[]).map(track=>track.audioUrl),...releaseRightsEvidence(release).filter(item=>item.privateFile).map(item=>item.href)];
    const ids=urls.map(url=>Number(new URL(url||'','https://hymn.local').pathname.match(/^\/api\/assets\/(\d+)\/download$/)?.[1]));
    if(ids.some(id=>!Number.isSafeInteger(id)||id<1))throw Error('Review recovery requires immutable private source files.');
    const assets=await lock.storedAsset.findMany({where:{id:{in:ids},ownerUserId:release.userId,deletedAt:null,uploadStatus:'ready'}});
    if(assets.length!==new Set(ids).size||assets.some(asset=>asset.updatedAt>transition.createdAt))throw Error('A source file changed after human review. Review it again.');
    await updateDetailedReleaseStatus(releaseId,'queued_for_distribution',String(qc.reason),undefined,{actorType:transition.actorType,actorId:transition.actorId,reviewApproval:true,reviewChanged:true,notify:false,persist:async tx=>{
      const current=await tx.release.findUniqueOrThrow({where:{id:releaseId}});
      if(current.version!==expectedVersion||current.archivedAt)throw Error('The review changed during recovery.');
    }});
    await lock.auditLog.create({data:{actorType:'system',action:'MANUAL_QC_SIGNATURE_RECOVERED',entity:'release',entityId:String(releaseId),metadata:{reviewTransitionId:transition.id,reviewAuditId:audit.id,previousVersion:expectedVersion,reason:'Resealed the unchanged audited human review using the current runtime signing configuration.'}}});
    return {recovered:true,releaseId};
  },{timeout:60000,maxWait:5000});
}
