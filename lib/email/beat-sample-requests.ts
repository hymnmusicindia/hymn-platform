import 'server-only';
import {createHash} from 'node:crypto';
import {prisma} from '@/lib/prisma';
import {createAdminTaskOnce} from '@/lib/task-queue';
import {createNotificationOnce} from '@/lib/notifications';
import {emailLayout,emailText} from './email-templates';
import {emailAppUrl} from './email-events';
import {sendTransactionalEmail,retryTransactionalEmail} from './send-transactional-email';
const taskType='Beat sample agreement request';
const requestKey=(id:number,email:string)=>`beat:${id}:sample-agreement:${createHash('sha256').update(email.toLowerCase()).digest('hex')}`;
export async function requestBeatSampleAgreement(beatId:number){
 const beat=await prisma.beat.findUniqueOrThrow({where:{id:beatId},include:{user:true}});
 if(beat.user.status!=='ACTIVE'||beat.sampleDeclaration==='NO_UNCONTROLLED_SAMPLES')throw Error('This beat does not need an active sample-agreement request.');
 const href=`/producer/beats/${beatId}/sample-license`;
 const task=await createAdminTaskOnce({eventKey:requestKey(beatId,beat.user.email),type:taskType,priority:'normal',title:`Request sample agreement: ${beat.title}`,body:'Owner-authorized request to the current producer account through HYMN SMTP. One email; suppress duplicates.',href,entityType:'beat',entityId:beatId});
 await createNotificationOnce({eventKey:`beat:${beatId}:sample-agreement-request`,userId:beat.userId,title:'Sample agreement required',body:`Attach the sample certificate for “${beat.title}” so HYMN can review the beat.`,type:'beat',href,actionLabel:'Attach agreement'});
 return task;
}
export async function deliverBeatSampleRequests(){
 await prisma.adminTask.updateMany({where:{type:taskType,status:'processing',snoozedUntil:{lt:new Date()}},data:{status:'review',resolutionNote:'The delivery lease expired. Inspect the SMTP receipt before resending; acceptance may have occurred.'}});
 const tasks=await prisma.adminTask.findMany({where:{type:taskType,status:'open',OR:[{snoozedUntil:null},{snoozedUntil:{lte:new Date()}}]},orderBy:{createdAt:'asc'},take:2});const result={checked:tasks.length,sent:0,review:0};
 for(const task of tasks){
  if(!(await prisma.adminTask.updateMany({where:{id:task.id,status:'open'},data:{status:'processing',snoozedUntil:new Date(Date.now()+10*60000)}})).count)continue;
  try{
   const beat=await prisma.beat.findUnique({where:{id:Number(task.entityId)},include:{user:true}});
   if(!beat||beat.user.status!=='ACTIVE'||task.eventKey!==requestKey(beat.id,beat.user.email))throw Error('Producer or recipient changed. Review before sending.');
   const evidence=await prisma.storedAsset.count({where:{entityType:'BEAT',entityId:String(beat.id),category:'BEAT_SAMPLE_LICENSE',ownerUserId:beat.userId,deletedAt:null}});
   if(evidence){await prisma.adminTask.update({where:{id:task.id},data:{status:'resolved',resolvedAt:new Date(),resolutionNote:'Sample agreement already supplied; no reminder sent.'}});continue;}
   const root=`${task.eventKey}:email`,logs=await prisma.emailLog.findMany({where:{eventKey:{startsWith:root}},orderBy:{createdAt:'desc'}});
   if(logs.some(log=>log.status==='sent')){await prisma.adminTask.update({where:{id:task.id},data:{status:'resolved',resolvedAt:new Date(),resolutionNote:'HYMN SMTP accepted the sample-agreement request; duplicate suppressed.'}});continue;}
   if(logs.some(log=>log.status==='queued')||logs.filter(log=>log.status==='failed').length>=3)throw Error('SMTP outcome needs review. No duplicate attempted.');
   const model={title:'Sample agreement needed',greeting:`Hi ${beat.user.name},`,body:`Please attach the sample licence / certificate for “${beat.title}”. Your submission mentions third-party samples. We need the provider, sample names and permissions covering the beat and its buyers before publication.`,notice:'For Splice samples, download the licence certificate from Splice and upload the relevant PDF. Do not include unrelated personal information. The agreement will be supplied privately to licensed buyers. Beats containing third-party samples or non-exclusive loops cannot be offered as exclusive on HYMN.',ctaLabel:'Attach sample agreement',ctaUrl:emailAppUrl(`/producer/beats/${beat.id}/sample-license`)};
   const latest=logs[0],delivery=latest?.status==='failed'?await retryTransactionalEmail(latest.id):await sendTransactionalEmail({to:beat.user.email,userId:beat.userId,entityType:'beat',entityId:beat.id,eventKey:root,template:'beat_sample_agreement_request',subject:`Sample agreement needed for ${beat.title}`,html:emailLayout(model),text:emailText(model)});
   if(delivery.status==='sent'){result.sent++;await prisma.adminTask.update({where:{id:task.id},data:{status:'resolved',resolvedAt:new Date(),resolutionNote:'HYMN SMTP accepted the sample-agreement request.'}});}else throw Error('SMTP did not confirm delivery. Inspect the email log before retrying.');
  }catch(error){result.review++;await prisma.adminTask.update({where:{id:task.id},data:{status:'review',resolutionNote:error instanceof Error?error.message:'Request needs review.'}});}
 }
 return result;
}
