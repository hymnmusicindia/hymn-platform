import 'server-only';
import {prisma} from './prisma';
import {assertMasterIdentity,assertPurchaseIdentity,masterManifest,masterTitleMismatch} from './beat-delivery-identity';
import {canDeliverBeatFile} from './beat-licence-terms';
import {createAdminTaskOnce} from './task-queue';
import {createNotificationOnce} from './notifications';
export const beatProcessingMessage='The producer is processing your requested file. It will be delivered to you shortly.';
export async function purchaseDelivery(purchaseId:number,userId?:number){
 const purchase=await prisma.beatPurchase.findFirst({where:{id:purchaseId,...(userId?{userId}:{}),hasAccess:true,user:{status:'ACTIVE'}},include:{user:true,licenseAsset:true,beat:{include:{deliverableAsset:true}}}});
 if(!purchase)throw Error('Purchase not found.');assertPurchaseIdentity(purchase);
 const snapshot=purchase.licenseTermsSnapshot as {deliveryMaster?:{assetId?:number}|null;beat?:{title?:string}}|null;
 const frozen=snapshot?.deliveryMaster;
 const asset=frozen?.assetId?await prisma.storedAsset.findUnique({where:{id:frozen.assetId}}):frozen===null?null:purchase.beat.deliverableAsset;
 if(!asset||asset.deletedAt||asset.uploadStatus!=='ready'||!canDeliverBeatFile(purchase.licenseType,asset.mimeType))return {purchase,asset:null,ready:false as const};
 assertMasterIdentity(purchase,purchase.beat.userId,asset);
 if(masterTitleMismatch(snapshot?.beat?.title||purchase.beat.title,asset.originalFilename)){
  const confirmed=await prisma.auditLog.findFirst({where:{entity:'beat',entityId:String(purchase.beatId),action:'beat.master_content_confirmed',metadata:{path:['checksum'],equals:asset.checksum}},select:{id:true}});
  if(!confirmed)return {purchase,asset:null,ready:false as const};
 }
 return {purchase,asset,ready:true as const};
}
export async function queuePurchaseFile(purchaseId:number){
 const delivery=await purchaseDelivery(purchaseId),p=delivery.purchase;
 if(delivery.ready)return null;
 const task=await createAdminTaskOnce({eventKey:`beat-purchase:${p.id}:requested-file`,type:'Beat requested file',priority:'normal',title:`Prepare ${p.licenseType.toUpperCase()}: ${p.beat.title}`,body:`Purchase #${p.id}. Supply the exact purchased beat and requested format. Do not substitute another recording or format.`,href:`/producer/deliveries/${p.id}`,entityType:'beat_purchase',entityId:p.id});
 await createNotificationOnce({eventKey:`beat-purchase:${p.id}:producer-file-request`,userId:p.beat.userId,title:'Purchased file requested',body:`Prepare ${p.licenseType.toUpperCase()} for “${p.beat.title}”, purchase #${p.id}.`,type:'beat',href:`/producer/deliveries/${p.id}`,actionLabel:'Upload requested file'});
 await createNotificationOnce({eventKey:`beat-purchase:${p.id}:processing`,userId:p.userId,title:'Your beat file is being prepared',body:beatProcessingMessage,type:'beat',href:`/dashboard/purchases/${p.id}`,actionLabel:'View purchase'});
 return task;
}
export async function processRequestedBeatFiles(){
 await prisma.adminTask.updateMany({where:{type:"Beat requested file",status:"sending",snoozedUntil:{lt:new Date()}},data:{status:"review",resolutionNote:"Delivery lease expired. Inspect its SMTP receipt before resending."}});
 const rows=await prisma.adminTask.findMany({where:{type:'Beat requested file',status:{in:['open','processing']},OR:[{snoozedUntil:null},{snoozedUntil:{lte:new Date()}}]},take:5,orderBy:[{status:'desc'},{createdAt:'asc'}]});let sent=0;
 for(const row of rows){
  if(!(await prisma.adminTask.updateMany({where:{id:row.id,status:row.status},data:{status:"sending",snoozedUntil:new Date(Date.now()+10*60000)}})).count)continue;
  try{
  const result=await purchaseDelivery(Number(row.entityId)),p=result.purchase;
  const {sendBeatEmailEvent,emailAppUrl}=await import('./email/email-events');
  if(!result.ready){
   const root=`beat:${p.id}:beat_file_processing:email`;
   const logs=await prisma.emailLog.findMany({where:{eventKey:{startsWith:root}},orderBy:{createdAt:'desc'}});
   if(logs.some(log=>log.status==='sent')){await prisma.adminTask.update({where:{id:row.id},data:{status:'waiting_producer',snoozedUntil:null}});continue;}
   if(logs.some(log=>log.status==='queued')||logs.filter(log=>log.status==='failed').length>=3){await prisma.adminTask.update({where:{id:row.id},data:{status:'review',resolutionNote:'Inspect the processing-email SMTP receipt before retrying.'}});continue;}
   const response=logs[0]?.status==='failed'?await (await import('./email/send-transactional-email')).retryTransactionalEmail(logs[0].id):await sendBeatEmailEvent({event:'beat_file_processing',purchaseId:p.id,userId:p.userId,to:p.user.email,userName:p.user.name,beatTitle:p.beat.title,url:emailAppUrl(`/dashboard/purchases/${p.id}`)});
   await prisma.adminTask.update({where:{id:row.id},data:response.status==='sent'?{status:'waiting_producer',snoozedUntil:null}:{status:'open',snoozedUntil:new Date(Date.now()+60*60000)}});continue;
  }
  const {generateBeatLicense}=await import('./beat-license');await generateBeatLicense(p.id,p.userId,false,undefined,{sendEmail:false});
  const root=`beat:${p.id}:license_ready:email:${result.asset!.checksum}`;
  const logs=await prisma.emailLog.findMany({where:{eventKey:{startsWith:root}},orderBy:{createdAt:'desc'}});
  if(logs.some(log=>log.status==='queued')){await prisma.adminTask.update({where:{id:row.id},data:{status:'review',resolutionNote:'An SMTP outcome is uncertain; inspect the receipt before retrying.'}});continue;}
  if(logs.some(log=>log.status==='sent')){await prisma.adminTask.update({where:{id:row.id},data:{status:'resolved',resolvedAt:new Date()}});continue;}
  if(logs.filter(log=>log.status==='failed').length>=3){await prisma.adminTask.update({where:{id:row.id},data:{status:'review',resolutionNote:'Three verified-delivery attempts failed. Inspect SMTP before retrying.'}});continue;}
  const response=logs[0]?.status==='failed'?await (await import('./email/send-transactional-email')).retryTransactionalEmail(logs[0].id):await sendBeatEmailEvent({event:'license_ready',deliveryReference:result.asset!.checksum,purchaseId:p.id,userId:p.userId,to:p.user.email,userName:p.user.name,beatTitle:p.beat.title,url:emailAppUrl(`/dashboard/purchases/${p.id}`)});
  if(response.status==='sent'||response.status==='duplicate_skipped'&&await prisma.emailLog.findFirst({where:{eventKey:`beat:${p.id}:license_ready:email:${result.asset!.checksum}`,status:'sent'},select:{id:true}})){await prisma.adminTask.update({where:{id:row.id},data:{status:'resolved',resolvedAt:new Date(),resolutionNote:'Verified requested file and bound agreement delivered by HYMN SMTP.'}});sent++;}else await prisma.adminTask.update({where:{id:row.id},data:{status:'processing',snoozedUntil:new Date(Date.now()+60*60000)}});
 }catch(error){await prisma.adminTask.update({where:{id:row.id},data:{status:'review',resolutionNote:error instanceof Error?error.message:'Delivery verification failed'}});console.error('Requested beat delivery deferred',{taskId:row.id,error:error instanceof Error?error.message:'Verification failed'});}}
 return {checked:rows.length,sent};
}
export {masterManifest};
