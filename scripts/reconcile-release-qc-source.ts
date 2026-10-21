/** Scoped QC-source reconciliation. Dry run by default; never replaces submission UPC/ISRCs. */
import { readFile } from 'node:fs/promises';
const option=(name:string)=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
async function main(){
  const env=option('env');if(env)process.loadEnvFile(env);
  const releaseId=Number(option('release')),sourceUpc=option('qc-upc');
  if(!Number.isSafeInteger(releaseId)||releaseId<1||!/^\d{12,14}$/.test(sourceUpc??''))throw Error('Supply --release=<id> and --qc-upc=<UPC>.');
  const {prisma}=await import('../lib/prisma');
  const {getDireNoteReleaseInformation,redactDireNoteDiagnostic}=await import('../lib/direnote');
  const {requestDireNoteV24}=await import('../lib/direnote/v24-client');
  const {buildReleaseQcReport,qcObject}=await import('../lib/direnote-qc-details');
  const {createHash}=await import('node:crypto');
  try{
    const release=await prisma.release.findUniqueOrThrow({where:{id:releaseId},include:{tracks:{orderBy:{trackNumber:'asc'}}}});
    const attempt=await prisma.distributionSubmissionAttempt.findFirstOrThrow({where:{releaseId,provider:'direnote',isCurrent:true},orderBy:{id:'desc'}});
    if(!release.upc||release.upc!==attempt.upc)throw Error('Current submission UPC requires separate identity reconciliation.');
    const status=await getDireNoteReleaseInformation(release.upc,{timeoutMs:20000});
    const statusData=qcObject(status.data),remoteRelease=qcObject(statusData.release),statusTracks=Array.isArray(statusData.tracks)?statusData.tracks.map(qcObject):[];
    if(!status.success||remoteRelease.upc_code!==release.upc||statusTracks.length!==release.tracks.length||!release.tracks.every(track=>statusTracks.some(row=>row.isrc===track.isrc)))throw Error('Current provider submission identity was not verified.');
    const fetched=await requestDireNoteV24('check_qc_report',{upc:sourceUpc},{timeoutMs:20000});
    if(!fetched.success)throw Error('Provider QC source could not be fetched.');
    const raw=qcObject(redactDireNoteDiagnostic(fetched.data));
    const current=buildReleaseQcReport(raw,{releaseId,attemptId:attempt.id,currentUpc:release.upc,sourceUpc:sourceUpc!,tracks:release.tracks});
    if(!current.verified)throw Error('QC-source tracks do not map to all current recording identifiers.');
    const aliases=Object.fromEntries(current.tracks.map(track=>[track.sourceIsrc,track.localTrackId!]));
    const supportFile=option('support-file');
    const supportRaw=supportFile?qcObject(JSON.parse(await readFile(supportFile,'utf8'))):null;
    const support=supportRaw?buildReleaseQcReport(supportRaw,{releaseId,attemptId:attempt.id,currentUpc:release.upc,sourceUpc:sourceUpc!,tracks:release.tracks,provenance:'partner_supplied',verifiedAliases:aliases}):null;
    if(support&&!support.verified)throw Error('Supplied evidence could not be bound through verified provider aliases.');
    const evidenceHash=createHash('sha256').update(JSON.stringify(supportRaw??raw)).digest('hex');
    const summary={mode:process.argv.includes('--apply')?'APPLY':'DRY_RUN',releaseId,currentSubmissionUpc:release.upc,qcSourceUpc:sourceUpc,attemptId:attempt.id,tracks:current.tracks.map(track=>({localTrackId:track.localTrackId,currentIsrc:track.isrc,qcSourceIsrc:track.sourceIsrc})),supportMatchCount:support?.tracks.reduce((sum,track)=>sum+track.matches.length,0)??0};
    if(process.argv.includes('--apply'))await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422027, ${releaseId}::integer)`;
      const active=await tx.distributionSubmissionAttempt.findFirst({where:{id:attempt.id,isCurrent:true}});
      const now=await tx.release.findUniqueOrThrow({where:{id:releaseId},include:{tracks:true}});
      if(!active||active.upc!==release.upc||now.upc!==release.upc||!now.tracks.every(track=>release.tracks.some(saved=>saved.id===track.id&&saved.isrc===track.isrc)))throw Error('Submission changed during reconciliation. Retry dry run.');
      const metadata=qcObject(now.metadata);
      await tx.release.update({where:{id:releaseId},data:{metadata:{...metadata,direNote:{...qcObject(metadata.direNote),qcSourceUpc:sourceUpc!,qcSourceAttemptId:attempt.id,qcSourceVerifiedAt:new Date().toISOString()}} as never}});
      const existing=await tx.auditLog.findFirst({where:{entity:'release',entityId:String(releaseId),action:'DIRENOTE_QC_SOURCE_RECONCILED',metadata:{path:['evidenceHash'],equals:evidenceHash}}});
      if(!existing){
        for(const report of [current,...(support?[support]:[])])await tx.direNoteLog.create({data:{releaseId,action:'release_qc_details',success:true,httpStatus:200,requestPayloadRedacted:{attemptId:attempt.id,upc:release.upc,sourceUpc:sourceUpc!,evidenceHash,hasMatches:report.tracks.some(track=>track.matches.length>0)},responseJson:JSON.parse(JSON.stringify(report))}});
        if(supportRaw)await tx.direNoteLog.create({data:{releaseId,action:'qc_support_evidence',success:true,requestPayloadRedacted:{attemptId:attempt.id,sourceUpc:sourceUpc!,evidenceHash},responseJson:redactDireNoteDiagnostic(supportRaw) as never}});
        await tx.auditLog.create({data:{entity:'release',entityId:String(releaseId),actorType:'system',action:'DIRENOTE_QC_SOURCE_RECONCILED',metadata:{...summary,evidenceHash}}});
      }
    },{timeout:60000,maxWait:10000});
    console.log(JSON.stringify(summary,null,2));
  }finally{await prisma.$disconnect();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'QC reconciliation failed');process.exitCode=1;});
