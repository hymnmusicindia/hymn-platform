import {NextResponse} from 'next/server';
import {requireRole} from '@/lib/access';
import {prisma} from '@/lib/prisma';
import {localPrivateStorage} from '@/lib/private-storage';
import {masterManifest} from '@/lib/beat-delivery-identity';
import {verifyRequestedBeatFile} from '@/lib/beat-requested-file-validation';
import {Prisma} from '@prisma/client';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const actor=await requireRole(['producer','admin']);if('error'in actor)return actor.error;
 const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:'Purchase not found.'},{status:404});
 const purchase=await prisma.beatPurchase.findFirst({where:{id,hasAccess:true,...(actor.user.role==='admin'?{}:{beat:{userId:actor.user.id}})},include:{beat:true}});
 if(!purchase)return NextResponse.json({error:'Purchase not found.'},{status:404});
 const requestTask=await prisma.adminTask.findFirst({where:{type:"Beat requested file",entityType:"beat_purchase",entityId:String(id),status:{notIn:["resolved","sending"]}},select:{id:true}});
 if(!requestTask)return NextResponse.json({error:"No open file request is available for this purchase."},{status:409});
 let storedId:number|null=null;
 try{
  const form=await request.formData(),file=form.get('file');
  if(form.get('contentConfirmed')!=='on'||String(form.get('beatTitle')||'').trim()!==purchase.beat.title)throw Error('Listen to the selected file and confirm the exact beat title before delivery.');
  if(!(file instanceof File)||!file.size||file.size>500*1024*1024)throw Error('Choose the requested file (up to 500 MB).');
  const extension=file.name.split('.').pop()?.toLowerCase(),mime=extension==='mp3'?'audio/mpeg':extension==='wav'?'audio/wav':extension==='zip'?'application/zip':'';
  const bytes=Buffer.from(await file.arrayBuffer());await verifyRequestedBeatFile(bytes,mime,purchase.licenseType);
  const filename=`${purchase.beat.title.replace(/[^\p{L}\p{N} ._-]/gu,'_')}-${purchase.licenseType}.${extension}`;
  const asset=await localPrivateStorage.upload({ownerUserId:purchase.beat.userId,assetType:'private_beat_deliverable',fileName:filename,mimeType:mime,bytes});storedId=asset.id;
  await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM admin_tasks WHERE id = ${requestTask.id} FOR UPDATE`;
   const task=await tx.adminTask.findUnique({where:{id:requestTask.id}});if(!task||["resolved","sending"].includes(task.status))throw Error("This delivery request changed. Refresh before uploading again.");
   await tx.$queryRaw`SELECT id FROM beat_purchases WHERE id = ${id} FOR UPDATE`;
   if(await tx.adminTask.findFirst({where:{entityType:"beat_purchase",entityId:String(id),type:"Beat requested file",status:"sending"},select:{id:true}}))throw Error("Delivery is already in progress. Wait before replacing this file.");
   const current=await tx.beatPurchase.findUniqueOrThrow({where:{id}});if(!current.hasAccess||current.updatedAt.getTime()!==purchase.updatedAt.getTime())throw Error('The purchase changed. Refresh before uploading again.');
   const saved=await tx.storedAsset.update({where:{id:asset.id},data:{entityType:'BEAT_PURCHASE',entityId:String(id),category:'REQUESTED_BEAT_FILE'}});
   const snapshot=current.licenseTermsSnapshot&&typeof current.licenseTermsSnapshot==='object'&&!Array.isArray(current.licenseTermsSnapshot)?current.licenseTermsSnapshot as Prisma.JsonObject:{};
   await tx.beatPurchase.update({where:{id},data:{licenseTermsSnapshot:{...snapshot,deliveryMaster:masterManifest(saved),deliveryState:'ready'},licenseUrl:null}});
   await tx.auditLog.create({data:{actorType:'user',actorId:actor.user.id,entity:'beat',entityId:String(purchase.beatId),action:'beat.master_content_confirmed',metadata:{purchaseId:id,beatTitle:purchase.beat.title,checksum:asset.checksum,assetId:asset.id,requestedFormat:purchase.licenseType,previousDelivery:snapshot.deliveryMaster||null,statement:'Producer confirms listening to the selected file and matching it to the purchased beat and requested format.'}}});
   await tx.adminTask.updateMany({where:{type:"Beat requested file",entityType:"beat_purchase",entityId:String(id),status:{not:"resolved"}},data:{status:"processing",snoozedUntil:null}});
  });storedId=null;
  // The pending task already exists; keep delivery retryable if this request disconnects.
  return NextResponse.json({success:true,message:'File verified and saved. HYMN will prepare the bound agreement and email the buyer.'});
 }catch(error){if(storedId)await localPrivateStorage.delete({assetId:storedId,requesterUserId:purchase.beat.userId,isAdmin:true}).catch(()=>undefined);return NextResponse.json({error:error instanceof Error?error.message:'Upload failed. Please retry.'},{status:400});}
}
