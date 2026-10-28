import 'server-only';
import { prisma } from './prisma';
import { automaticReleaseRiskHold } from './distribution-automation-risk';
import { getDetailedReleaseById, updateDetailedReleaseStatus } from './distribution-db';
import { validateReleaseForDireNote } from './direnote-readiness';
import { assertReleaseArtistVerification } from './release-artist-verification';
import { automaticQcRevision, automationSensitiveSnapshot, distributionAutomationDecision, technicalReleaseFixes, canResolveRequestedFormatting } from './distribution-automation-policy';
import { signQcEvidence, validQcEvidence, assertAutomaticQcSources } from './distribution-qc-evidence';
import { localPrivateStorage } from './private-storage';
import { verifyArtworkIntegrity, verifyAudioIntegrity } from './media-integrity';
import { resolvePrivateReleaseArtworkUrl } from './release-asset-resolution';
import type { Release } from './types';

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
export async function automaticDeliveryContext(releaseId: number,userId: number) {
  const [attempt, amendment, fraudHold] = await Promise.all([
    prisma.distributionSubmissionAttempt.findFirst({ where: { releaseId, provider: 'direnote', isCurrent: true }, select: { state: true, corrections: true } }),
    prisma.releaseChangeRequest.findFirst({ where: { releaseId, status: { notIn: ['cancelled','completed','rejected','failed'] } }, select: { id: true } }),
    automaticReleaseRiskHold(releaseId,userId),
  ]);
  return { fraudHold, retryable: attempt?.state === 'retryable', accepted: attempt?.state === 'submitted', uncertainAttempt: Boolean(attempt && ['processing','reconciliation_required','failed'].includes(attempt.state)), correctionResolved: object(attempt?.corrections).status === 'customer_resolved', openAmendment: Boolean(amendment) };
}

export async function runIntelligentDistributionQc(releaseId: number, siteUrl: string) {
  if(process.env.DISTRIBUTION_AUTOMATION_ENABLED==='false')return false;
  return prisma.$transaction(async lock=>{
    const rows=await lock.$queryRaw<Array<{locked:boolean}>>`SELECT pg_try_advisory_xact_lock(81422036, ${releaseId}::integer) AS locked`;
    return rows[0]?.locked?checkRelease(releaseId,siteUrl):false;
  },{timeout:60000,maxWait:5000});
}

async function recordQc(release: Release, evidence: Record<string,unknown>) {
  return prisma.$transaction(async tx=>{
    const current=await tx.release.findUnique({where:{id:release.id},select:{metadata:true,updatedAt:true,version:true,status:true}});
    if(!current||current.updatedAt.getTime()!==Date.parse(release.draftVersion||'')||!['UNDER_REVIEW','APPROVED','QUEUED_FOR_DISTRIBUTION','CHANGES_REQUESTED'].includes(current.status))return false;
    const report=json({...evidence,checkedAt:new Date().toISOString(),checkedVersion:current.version,policyVersion:2});report.proof=signQcEvidence(report);
    const changed=await tx.release.updateMany({where:{id:release.id,updatedAt:current.updatedAt,version:current.version,status:current.status},data:{metadata:json({...object(current.metadata),autoQc:report})}});
    if(changed.count)await tx.auditLog.create({data:{actorType:'system',action:'DISTRIBUTION_AUTO_QC_CHECKED',entity:'release',entityId:String(release.id),metadata:json({revision:report.revision,status:report.status,changeKind:report.changeKind,issueCount:report.issueCount,fixCount:report.fixes?.length||0})}});
    return changed.count===1;
  });
}

async function applyFormatting(release: Release, fixes: ReturnType<typeof technicalReleaseFixes>) {
  if(!fixes.length)return release;
  const changed=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${release.id}::integer)`;
    const row=await tx.release.findFirst({where:{id:release.id,updatedAt:new Date(release.draftVersion!),status:{in:['UNDER_REVIEW','APPROVED']}}});if(!row)return false;
    const title=fixes.find(fix=>fix.field==='releaseTitle');
    for(const fix of fixes.filter(item=>item.field.startsWith('tracks.'))) {
      const track=release.tracks?.[Number(fix.field.split('.')[1])];if(track)await tx.track.updateMany({where:{id:track.id,releaseId:release.id},data:{title:fix.after}});
    }
    const metadata=object(row.metadata);
    const saved=await tx.release.updateMany({where:{id:row.id,updatedAt:row.updatedAt,version:row.version},data:{...(title?{title:title.after}:{}),metadata:json({...metadata,...(title?{releaseTitle:title.after}:{}),autoQc:{...object(metadata.autoQc),status:'pending',technicalFixes:fixes}}),version:{increment:1}}});
    if(saved.count!==1)throw Error('The submitted package changed during formatting checks.');
    await tx.auditLog.create({data:{actorType:'system',action:'DISTRIBUTION_TECHNICAL_FORMATTING_FIXED',entity:'release',entityId:String(row.id),metadata:json({fixes})}});return true;
  });
  return changed?getDetailedReleaseById(release.id):null;
}

async function checkRelease(releaseId: number, siteUrl: string) {
  let release=await getDetailedReleaseById(releaseId);if(!release||release.paymentStatus!=='paid')return false;
  if(release.status==='changes_requested'&&!canResolveRequestedFormatting(release)){await recordQc(release,{revision:automaticQcRevision(release),snapshot:automationSensitiveSnapshot(release),status:'manual_review_required',reason:'The requested changes require customer action or a reviewer. No creative or rights changes were made.',issueCount:1});return false;}
  if(canResolveRequestedFormatting(release)) {
    const context=await automaticDeliveryContext(releaseId,release.userId);
    if(context.accepted||context.uncertainAttempt||context.openAmendment){await recordQc(release,{revision:automaticQcRevision(release),snapshot:automationSensitiveSnapshot(release),status:'manual_review_required',reason:'An existing delivery or amendment needs review before any correction can be sent.',issueCount:1});return false;}
    await updateDetailedReleaseStatus(releaseId,'resubmitted','HYMN is rechecking a technical title-formatting correction.',undefined,{notify:false});
    release=await getDetailedReleaseById(releaseId);if(!release)return false;
  }
  if(['submitted','resubmitted','in_queue','in_qc_queue'].includes(release.status)) {
    await updateDetailedReleaseStatus(releaseId,'under_review','HYMN received the submitted package for automatic checks.',undefined,{notify:false});release=await getDetailedReleaseById(releaseId);
  }
  if(!release||!['under_review','approved','queued_for_distribution'].includes(release.status))return false;
  const previous=object(release.metadata?.autoQc), prior=validQcEvidence(previous)?previous:object(previous.previousResult);
  const revision=automaticQcRevision(release), snapshot=automationSensitiveSnapshot(release);
  if(validQcEvidence(previous)&&previous.revision===revision&&['issues_found','manual_review_required'].includes(String(previous.status)))return false;
  const context=await automaticDeliveryContext(releaseId,release.userId);
  const decision=distributionAutomationDecision(release,context);
  const base={revision,snapshot,changeKind:decision.route,reason:decision.reason,issueCount:0,warningCount:0,checks:[] as {label:string;ready:boolean}[],issues:[] as {field:string;message:string}[],fixes:[] as {field:string;before:string;after:string}[]};
  if(context.correctionResolved&&(!validQcEvidence(prior)||prior.changeKind==='missing_baseline')) {
    await recordQc(release,{...base,changeKind:'missing_baseline',status:'manual_review_required',reason:'The earlier corrected delivery has no signed QC baseline. A reviewer must compare its identity, rights and creative declarations before resubmission.',issueCount:1});return false;
  }
  const sensitiveChanged=validQcEvidence(prior)&&typeof prior.snapshot==='string'&&prior.snapshot!==snapshot;
  if(!decision.eligible||sensitiveChanged) {
    const reason=sensitiveChanged?'Artist identity, contributor, rights or explicit-content declarations changed. A reviewer must confirm this change.':decision.reason;
    await recordQc(release,{...base,...(sensitiveChanged?{snapshot:prior.snapshot,changeKind:'sensitive_change'}:{}),status:'manual_review_required',reason,issueCount:1,issues:[{field:'review',message:reason}]});return false;
  }
  if(validQcEvidence(previous)&&previous.revision===revision&&previous.status==='passed'){try{await assertAutomaticQcSources(release);return true;}catch{/* Recheck the actual selected files below. */}}
  try {
    const fixes=technicalReleaseFixes(release);
    if(release.status==='queued_for_distribution'&&fixes.length){await recordQc(release,{...base,status:'manual_review_required',reason:'A queued retry requires a reviewer before changing its original package.',issueCount:1});return false;}
    release=await applyFormatting(release,fixes);if(!release)return false;
    base.revision=automaticQcRevision(release);base.fixes=fixes.length?fixes:json(previous.technicalFixes||previous.fixes||[]);
    await assertReleaseArtistVerification(release.userId,release.id);
    const readiness=await validateReleaseForDireNote(release,{siteUrl});base.checks=readiness.checklist;base.issueCount=readiness.issues.length;base.warningCount=readiness.warnings.length;base.issues=readiness.issues.map(issue=>({field:issue.field,message:issue.message}));
    if(!readiness.ready) {
      const temporary=readiness.issues.some(issue=>/unavailable|retry|temporar|rate.limit|timed.out|could not verify/i.test(issue.message));const retryCount=Number(previous.retryCount||0)+1;
      await recordQc(release,{...base,status:temporary&&retryCount<=5?'retryable':temporary?'manual_review_required':'issues_found',reason:temporary?'A required check is temporarily unavailable. Delivery is paused.':'The current package has blocking technical issues.',retryCount,nextCheckAt:temporary?new Date(Date.now()+Math.min(3600,60*2**retryCount)*1000).toISOString():null});return false;
    }
    const artwork = await resolvePrivateReleaseArtworkUrl({userId:release.userId,releaseId:release.id,value:release.artworkUrl});
    const sources=[{label:'Cover artwork',url:artwork,kind:'artwork'},...(release.tracks||[]).map((track,index)=>({label:`Track ${index+1} audio`,url:track.audioUrl,kind:'audio'}))];
    const cached=validQcEvidence(prior)&&Array.isArray(prior.assetChecks)?prior.assetChecks as {id:number;checksum:string}[]:[];
    const verified: {id:number;checksum:string}[]=[];const started=Date.now();let bytes=0;
    for(const source of sources) {
      const match=new URL(source.url,siteUrl).pathname.match(/^\/api\/assets\/(\d+)\/download$/);
      if(!match){await recordQc(release,{...base,status:'manual_review_required',reason:'A legacy source needs protected-file verification before automatic delivery.',issueCount:1,issues:[{field:source.label,message:'Link a verified private source asset or ask a reviewer to check this file.'}]});return false;}
      const asset=await prisma.storedAsset.findFirst({where:{id:Number(match[1]),ownerUserId:release.userId,deletedAt:null,uploadStatus:'ready'},select:{id:true,checksum:true,byteSize:true,mimeType:true,assetType:true}});
      if(!asset||asset.assetType!==(source.kind==='artwork'?'private_unreleased_artwork':'private_audio_master'))throw Error(`${source.label} is not an available private source file.`);
      if(cached.some(item=>item.id===asset.id&&item.checksum===asset.checksum)){verified.push({id:asset.id,checksum:asset.checksum});continue;}
      if(asset.byteSize>200*1024*1024){await recordQc(release,{...base,status:'manual_review_required',reason:'A large source file needs extended media verification.',issueCount:1});return false;}
      if((Date.now()-started>10000||bytes>160*1024*1024)&&verified.length){await recordQc(release,{...base,status:'pending',reason:'Verified files are saved. Remaining media checks continue in the next cycle.',assetChecks:verified});return false;}
      const file=await localPrivateStorage.createAuthorizedRead({assetId:asset.id,requesterUserId:release.userId,isAdmin:false});bytes+=file.bytes.length;
      if(source.kind==='artwork')await verifyArtworkIntegrity(file.bytes);else await verifyAudioIntegrity(file.bytes,file.mimeType);
      verified.push({id:asset.id,checksum:asset.checksum});
    }
    base.checks.push({label:'Protected artwork and audio integrity',ready:true},{label:'Customer declarations and identity checks',ready:true});
    return recordQc(release,{...base,status:'passed',reason:'Metadata, private-file integrity, identity and customer declarations passed for this submitted revision.',assetChecks:verified});
  } catch(error) {
    if(!release)return false;
    const message=error instanceof Error?error.message:'A required check could not be completed.';const temporary=/ENOENT|ECONN|ETIMEDOUT|timeout|unavailable|rate.limit|temporar/i.test(message);const retryCount=Number(previous.retryCount||0)+1;
    await recordQc(release,{...base,status:temporary&&retryCount<=5?'retryable':'manual_review_required',reason:temporary?'A required service or private source is temporarily unavailable. No delivery was sent.':'Automatic checks could not establish a safe delivery decision.',issueCount:1,issues:[{field:'verification',message:temporary?'Retry is scheduled. A reviewer will be asked if the service remains unavailable.':'Ask a reviewer to verify the protected source files and artist confirmations.'}],retryCount,nextCheckAt:temporary?new Date(Date.now()+Math.min(3600,60*2**retryCount)*1000).toISOString():null});return false;
  }
}
