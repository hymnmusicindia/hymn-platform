import 'server-only';
import { prisma } from '@/lib/prisma';
import { buildReleaseQcReport, qcObject, type QcLocalTrack, type ReleaseQcReport } from '@/lib/direnote-qc-details';
import { normalizeDireNoteUpc } from '@/lib/direnote-upc';
import { requestDireNoteV24 } from '@/lib/direnote/v24-client';
import { reserveDireNoteRequest } from '@/lib/direnote-rate-limit';
import { redactDireNoteDiagnostic } from '@/lib/direnote';

export async function saveReleaseQcReport(report:ReleaseQcReport){
  if(!report.verified)throw Error('QC track identities could not be verified for this submission.');
  await prisma.direNoteLog.create({data:{releaseId:report.releaseId,action:'release_qc_details',success:true,httpStatus:200,requestPayloadRedacted:{attemptId:report.attemptId,upc:report.currentUpc,sourceUpc:report.sourceUpc,hasMatches:report.tracks.some(track=>track.matches.length>0)},responseJson:JSON.parse(JSON.stringify(report))}});
  return report;
}
export async function readReleaseQcReport(releaseId:number,db:Pick<typeof prisma,'distributionSubmissionAttempt'|'direNoteLog'>=prisma):Promise<ReleaseQcReport|null>{
  const attempt=await db.distributionSubmissionAttempt.findFirst({where:{releaseId,provider:'direnote',isCurrent:true},orderBy:{id:'desc'},select:{id:true,upc:true}});
  if(!attempt)return null;
  const [logs,evidence]=await Promise.all([
    db.direNoteLog.findMany({where:{releaseId,action:'release_qc_details',success:true,requestPayloadRedacted:{path:['attemptId'],equals:attempt.id}},orderBy:{id:'desc'},take:20,select:{responseJson:true}}),
    db.direNoteLog.findFirst({where:{releaseId,action:'release_qc_details',success:true,AND:[{requestPayloadRedacted:{path:['attemptId'],equals:attempt.id}},{requestPayloadRedacted:{path:['hasMatches'],equals:true}}]},orderBy:{id:'desc'},select:{responseJson:true}})
  ]);
  const reports=[...(evidence?[evidence]:[]),...logs].map(log=>log.responseJson as unknown as ReleaseQcReport).filter(report=>report.version===1&&report.verified&&report.attemptId===attempt.id&&report.currentUpc===attempt.upc);
  // Preserve a labelled evidence snapshot when the provider later omits detailed ACR data.
  return reports.find(report=>report.tracks.some(track=>track.matches.length)) ?? reports[0] ?? null;
}

export async function fetchBoundReleaseQcReport(input:{releaseId:number;attemptId:number;upc:string;tracks:QcLocalTrack[];reviewFingerprint:string;sourceUpc?:string;actorId?:number|null;timeoutMs?:number}){
  const sourceUpc=normalizeDireNoteUpc(input.sourceUpc) ?? input.upc;
  const recent=await prisma.direNoteLog.findFirst({where:{releaseId:input.releaseId,action:'correction_qc_report',createdAt:{gte:new Date(Date.now()-3600000)},AND:[{requestPayloadRedacted:{path:['attemptId'],equals:input.attemptId}},{requestPayloadRedacted:{path:['reviewFingerprint'],equals:input.reviewFingerprint}},{requestPayloadRedacted:{path:['upc'],equals:sourceUpc}}]},orderBy:{id:'desc'}});
  let raw=recent?.success?qcObject(recent.responseJson):null;
  if(!recent){
    await reserveDireNoteRequest('correction_qc_report',input.releaseId,input.actorId);
    const result=await requestDireNoteV24('check_qc_report',{upc:sourceUpc},{timeoutMs:input.timeoutMs ?? 15000});
    const safe=redactDireNoteDiagnostic(result.data ?? {});
    await prisma.direNoteLog.create({data:{releaseId:input.releaseId,action:'correction_qc_report',success:result.success,httpStatus:result.httpStatus,requestPayloadRedacted:{upc:sourceUpc,attemptId:input.attemptId,reviewFingerprint:input.reviewFingerprint},responseJson:safe as never,errorMessage:result.error ?? null}});
    if(result.httpStatus===429)await prisma.direNoteLog.create({data:{action:'provider_rate_limit',success:false,httpStatus:429,responseJson:{retryAt:new Date(Date.now()+Math.max(60,result.retryAfterSeconds ?? 3600)*1000).toISOString()}}});
    if(result.success)raw=qcObject(safe);
  }
  if(!raw)return {raw:null,report:await readReleaseQcReport(input.releaseId)};
  const report=buildReleaseQcReport(raw,{releaseId:input.releaseId,attemptId:input.attemptId,currentUpc:input.upc,sourceUpc,tracks:input.tracks});
  if(!report.verified)throw Error('QC report contains mismatched track identifiers.');
  if(!recent)await saveReleaseQcReport(report);
  return {raw,report:await readReleaseQcReport(input.releaseId) ?? report};
}
