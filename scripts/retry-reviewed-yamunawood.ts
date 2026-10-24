/** Targeted, audited recovery of the owner-approved YAMUNAWOOD correction.
 * Dry-run by default. Never claims that an uncertain legacy request was not received. */
async function main() {
  process.loadEnvFile('.env.hostinger');
  // Keep this one-off workstation job from opening a large CPU-sized pool.
  // One connection holds the release lock while the normal pipeline uses others.
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  databaseUrl.searchParams.set('connection_limit','4');
  databaseUrl.searchParams.set('connect_timeout','30');
  databaseUrl.searchParams.set('pool_timeout','30');
  process.env.DATABASE_URL=databaseUrl.toString();
  const { prisma } = await import('../lib/prisma');
  const { getDireNoteReleaseInformation, getDireNoteIngestStatus, redactDireNoteDiagnostic } = await import('../lib/direnote');
  const { reserveDireNoteRequest } = await import('../lib/direnote-rate-limit');
  const { verifiedDireNoteCatalogue } = await import('../lib/direnote-submission-evidence');
  const object = (v:unknown):Record<string,any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string,any> : {};
  try {
    if (process.argv.includes('--poll-only')) { console.log(JSON.stringify(await (await import('../lib/direnote-ingest-jobs')).pollDireNoteIngestJobs({releaseId:81,limit:1}))); return; }
    const release = await prisma.release.findUniqueOrThrow({where:{id:81},include:{tracks:true,distributionSubmissions:{orderBy:{id:'desc'}}}});
    const marker=object(object(release.metadata).correctionReview);
    if (release.title !== 'YAMUNAWOOD' || release.upc !== '3473620319543' || release.status !== 'APPROVED' || marker.status !== 'approved' || !marker.submissionKey || !marker.receivedAt) throw Error('This recovery applies only to the already approved YAMUNAWOOD correction. Inspect current delivery before any further action.');
    if(process.argv.includes('--resume')) {
      const retired=release.distributionSubmissions.find(a=>a.id===28 && a.state==='superseded' && !a.isCurrent && object(object(a.responseRedacted).recovery).correctionSubmissionKey===marker.submissionKey);
      if(!retired || release.distributionSubmissions.some(a=>a.id>28))throw Error('Resume scope changed; inspect the newest attempt before proceeding.');
      const result=await (await import('../lib/distribution-service')).submitRelease(81,{retry:true,correctionReingest:true});
      console.log(JSON.stringify({submitted:result.submitted,error:'error'in result?result.error:null,issues:result.validation.issues}));
      if(!result.submitted)process.exitCode=1;
      return;
    }
    const catalogueAttempt=release.distributionSubmissions.find(a=>a.id===23 && a.isCurrent && object(a.responseRedacted).source==='dashboard_reconciliation');
    const uncertain=release.distributionSubmissions.find(a=>a.id===28 && !a.isCurrent && a.state==='reconciliation_required' && !a.providerReference && a.startedAt<new Date(marker.receivedAt));
    if (!catalogueAttempt || !uncertain) throw Error('Historical attempt scope changed; no recovery was applied.');
    const failure=await prisma.direNoteLog.findFirst({where:{releaseId:81,action:'release_submission',success:false,httpStatus:200,createdAt:{gte:uncertain.startedAt,lte:new Date(uncertain.startedAt.getTime()+5*60000)}},orderBy:{id:'desc'}});
    if(object(failure?.responseJson).success!==false || object(failure?.responseJson).error!=='MySQL server has gone away') throw Error('The expected legacy transport-failure evidence is missing.');
    await reserveDireNoteRequest('reviewed_correction_catalogue_check',81);
    const catalogue=await getDireNoteReleaseInformation(release.upc,{timeoutMs:20000});
    const raw=redactDireNoteDiagnostic(catalogue.data) as any;
    if(!catalogue.success || !verifiedDireNoteCatalogue({...catalogueAttempt,rawStatusPayload:raw},release) || !raw.tracks.every((track:any)=>/^(rejected|changes_required)$/i.test(track.status))) throw Error('The existing catalogue identity/rejection was not verified. No delivery was attempted.');
    await reserveDireNoteRequest('reviewed_correction_legacy_job_check',81);
    const job=await getDireNoteIngestStatus({idempotencyKey:uncertain.idempotencyKey},{timeoutMs:20000});
    if(job.httpStatus!==404 || object(job.data).error!=='Job not found') throw Error('The legacy job lookup is no longer missing. Reconcile that job instead of resubmitting.');
    console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'dry-run',releaseId:81,verifiedHistoricalUpc:release.upc,legacyAttemptId:uncertain.id,legacyJobLookup:'not_found',approvedCorrectionAt:marker.reviewedAt,action:'Supersede the old unresolved request, preserve its evidence, and submit the separately approved correction revision.'}));
    if(!process.argv.includes('--apply'))return;
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${81}::integer)`;
      const current=await tx.release.findUniqueOrThrow({where:{id:81}});
      if(current.status!=='APPROVED'||object(object(current.metadata).correctionReview).submissionKey!==marker.submissionKey)throw Error('The approved correction changed during verification.');
      const stillUncertain=await tx.distributionSubmissionAttempt.findFirst({where:{id:uncertain.id,state:'reconciliation_required',isCurrent:false}});
      if(!stillUncertain)throw Error('The legacy attempt changed during verification.');
      await tx.distributionSubmissionAttempt.update({where:{id:catalogueAttempt.id},data:{state:'submitted',safeError:null,providerStatus:'changes_required',rawStatusPayload:raw,lastCheckedAt:new Date()}});
      await tx.distributionSubmissionAttempt.update({where:{id:uncertain.id},data:{state:'superseded',providerStatus:'superseded',safeError:'Historical legacy request remains unconfirmed. Superseded by verified catalogue evidence and a later owner-approved correction; the old request was not retried.',responseRedacted:{...object(uncertain.responseRedacted),recovery:{source:'owner_requested_correction_repush',catalogueAttemptId:catalogueAttempt.id,verifiedUpc:release.upc,legacyFailureLogId:failure!.id,legacyJobLookup:'not_found',correctionSubmissionKey:marker.submissionKey,reviewedAt:marker.reviewedAt}},completedAt:new Date()}});
      await tx.auditLog.create({data:{actorType:'system',action:'REVIEWED_CORRECTION_LEGACY_ATTEMPT_SUPERSEDED',entity:'release',entityId:'81',metadata:{catalogueAttemptId:catalogueAttempt.id,supersededAttemptId:uncertain.id,legacyFailureLogId:failure!.id,catalogueUpc:release.upc,correctionSubmissionKey:marker.submissionKey,evidence:'Owner explicitly requested re-push of the approved correction. Verified the older rejected catalogue with all five recording identities. Legacy request returned a database error and its job lookup returned not found; its outcome is preserved as unconfirmed, not recorded as non-receipt.'}}});
    }, {timeout:60000,maxWait:15000});
    const result=await (await import('../lib/distribution-service')).submitRelease(81,{retry:true,correctionReingest:true});
    console.log(JSON.stringify({submitted:result.submitted,duplicate:'duplicate'in result?result.duplicate:false,error:'error'in result?result.error:null,issues:result.validation.issues}));
    if(!result.submitted)process.exitCode=1;
  } finally { await prisma.$disconnect(); }
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
