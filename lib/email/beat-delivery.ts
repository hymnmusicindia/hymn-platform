import {assertMasterIdentity,assertLicenceAsset,verifyAgreementBytes} from "../beat-delivery-identity";
import 'server-only';
import {createHash} from 'node:crypto';
import {prisma} from '@/lib/prisma';
import {createAdminTaskOnce} from '@/lib/task-queue';
import {generateBeatLicense} from '@/lib/beat-license';
import {localPrivateStorage} from '@/lib/private-storage';
import {canDeliverBeatFile} from '@/lib/beat-licence-terms';
import {emailAppUrl,sendBeatEmailEvent} from './email-events';
import {getEmailConfig} from './email-client';
import {retryTransactionalEmail} from './send-transactional-email';

const taskType='Beat delivery';
function deliveryKey(purchaseId:number,userId:number,email:string){return `beat:${purchaseId}:delivery:${userId}:${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}`;}

/** Queue only explicitly requested delivery; bind it to the verified account recipient. */
export async function requestBeatDelivery(purchaseId:number,userId:number,recipient:string){
  const purchase=await prisma.beatPurchase.findFirst({where:{id:purchaseId,userId,hasAccess:true},include:{user:true,beat:{select:{title:true}}}});
  if(!purchase||purchase.user.status!=='ACTIVE'||purchase.user.email.toLowerCase()!==recipient.trim().toLowerCase())throw Error('Purchase recipient does not match an active account.');
  return createAdminTaskOnce({eventKey:deliveryKey(purchaseId,userId,recipient),type:taskType,priority:'normal',title:`Deliver beat and agreement: ${purchase.beat.title}`,body:'Owner-requested delivery through HYMN SMTP. Verify the licensed master and PDF before sending. Do not send duplicate confirmations.',href:`/licenses/${purchaseId}`,entityType:'beat_purchase',entityId:purchaseId});
}

/** Uses the live runtime's private storage and HYMN SMTP, never local workstation files. */
export async function deliverRequestedBeats(){
  const now=new Date();
  const tasks=await prisma.adminTask.findMany({where:{type:taskType,entityType:'beat_purchase',status:'open',OR:[{snoozedUntil:null},{snoozedUntil:{lte:now}}]},orderBy:{createdAt:'asc'},take:1});
  const result={checked:tasks.length,sent:0,pending:0,review:0};
  for(const task of tasks){
    // Never reclaim an expired processing lease automatically: SMTP may have accepted
    // the previous message even if the process died before saving its receipt.
    const claimed=await prisma.adminTask.updateMany({where:{id:task.id,status:'open',OR:[{snoozedUntil:null},{snoozedUntil:{lte:now}}]},data:{status:'processing',snoozedUntil:new Date(Date.now()+10*60000)}});
    if(!claimed.count)continue;
    const review=async(note:string)=>{result.review++;await prisma.adminTask.update({where:{id:task.id},data:{status:'review',resolutionNote:note}});};
    const pending=async(note:string)=>{result.pending++;await prisma.adminTask.update({where:{id:task.id},data:{status:'open',snoozedUntil:new Date(Date.now()+60*60000),resolutionNote:note}});};
    try{
      const id=Number(task.entityId);
      const purchase=Number.isSafeInteger(id)&&id>0?await prisma.beatPurchase.findUnique({where:{id},include:{user:true,beat:{include:{deliverableAsset:true}}}}):null;
      if(!purchase||!purchase.hasAccess||purchase.user.status!=='ACTIVE'||task.eventKey!==deliveryKey(id,purchase.userId,purchase.user.email)){
        await review('Purchase access or recipient changed. Delivery stopped.');continue;
      }
      const root=`beat:${id}:license_ready:email`;
      const logs=await prisma.emailLog.findMany({where:{entityType:'beat_purchase',entityId:String(id),template:'license_ready',toEmail:purchase.user.email,eventKey:{startsWith:root}},orderBy:{createdAt:'desc'}});
      if(logs.some(log=>log.status==='sent')){
        await prisma.adminTask.update({where:{id:task.id},data:{status:'resolved',resolvedAt:new Date(),resolutionNote:'HYMN delivery already sent; duplicate suppressed.'}});continue;
      }
      if(logs.some(log=>log.status==='queued')){await review('An earlier SMTP attempt has an uncertain outcome; inspect its receipt before retrying.');continue;}
      if(!getEmailConfig().enabled){await pending('HYMN SMTP is not configured in this runtime. No email attempted.');continue;}
      const master=purchase.beat.deliverableAsset;
      if(!master||master.deletedAt||!canDeliverBeatFile(purchase.licenseType,master.mimeType)){
        await pending('The licensed master is not ready. No email attempted.');continue;
      }
      assertMasterIdentity(purchase,purchase.beat.userId,master);
      // Read full bytes, verifying storage authorization and SHA-256 integrity.
      await localPrivateStorage.createAuthorizedRead({assetId:master.id,requesterUserId:purchase.userId,isAdmin:false});
      await generateBeatLicense(id,purchase.userId,false,undefined,{sendEmail:false});
      const ready=await prisma.beatPurchase.findUniqueOrThrow({where:{id},include:{licenseAsset:true}});
      if(!ready.hasAccess||!ready.licenseUrl||!ready.licenseAsset||ready.licenseAsset.deletedAt){await pending('The agreement PDF is not ready. No email attempted.');continue;}
      const pdf=await localPrivateStorage.createAuthorizedRead({assetId:ready.licenseAsset.id,requesterUserId:purchase.userId,isAdmin:false});
      assertLicenceAsset(ready,ready.licenseAsset);
      await verifyAgreementBytes(pdf.bytes,ready);
      const latest=logs[0];
      if(logs.filter(log=>log.status==='failed').length>=3){await review('Three SMTP attempts failed; manual review required.');continue;}
      const delivery=latest?.status==='failed'?await retryTransactionalEmail(latest.id):latest?null:await sendBeatEmailEvent({event:'license_ready',purchaseId:id,userId:purchase.userId,to:purchase.user.email,userName:purchase.user.name,beatTitle:purchase.beat.title,url:emailAppUrl(`/licenses/${id}`)});
      if(delivery?.status==='sent'){
        result.sent++;await prisma.adminTask.update({where:{id:task.id},data:{status:'resolved',resolvedAt:new Date(),resolutionNote:'Master and PDF verified; HYMN SMTP accepted delivery.'}});
      }else if(delivery?.status==='failed'||delivery?.status==='skipped'){
        await pending('SMTP delivery has not been confirmed. Retry is limited and scheduled.');
      }else{await review('Delivery outcome needs inspection; no duplicate email attempted.');}
    }catch{
      await pending('Files or agreement could not be prepared. No successful delivery claimed.');
    }
  }
  return result;
}
