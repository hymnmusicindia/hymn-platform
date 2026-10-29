import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { producerSetup } from '@/lib/producer-setup';
import { beatQcReport } from './beat-qc';
import { localPrivateStorage } from './private-storage';
import { verifyAudioIntegrity } from './media-integrity';
const unlockWhere=(userId:number)=>({entity:'producer',entityId:String(userId),action:'producer.beats_auto_publish_unlocked'});
export async function producerHasApprovedBeat(userId:number){return Boolean(await prisma.auditLog.findFirst({where:unlockWhere(userId),select:{id:true}})||await prisma.beat.findFirst({where:{userId,status:{in:['PUBLISHED','EXCLUSIVE_RESERVED','EXCLUSIVELY_SOLD']}},select:{id:true}}));}
/** The caller retains the review queue when storage, QC or publication fails. */
export async function autoPublishProducerBeat(beatId:number){
 const beat=await prisma.beat.findUnique({where:{id:beatId},include:{audio:true,artwork:true,deliverableAsset:true,user:{include:{producerProfile:true}}}});
 if(!beat||!['PENDING_REVIEW','PUBLISHED'].includes(beat.status))return false;
 const [declaration,evidenceCount]=await Promise.all([prisma.auditLog.findFirst({where:{entity:'beat',entityId:String(beatId),action:'beat.sample_rights_declared'},orderBy:{createdAt:'desc'}}),prisma.storedAsset.count({where:{entityType:'BEAT',entityId:String(beatId),category:'BEAT_SAMPLE_LICENSE',ownerUserId:beat.userId,deletedAt:null}})]);
 let masterVerified=false;
 if(beat.deliverableAsset&&!beat.deliverableAsset.deletedAt&&['audio/mpeg','audio/wav','audio/x-wav'].includes(beat.deliverableAsset.mimeType))try{const file=await localPrivateStorage.createAuthorizedRead({assetId:beat.deliverableAsset.id,requesterUserId:beat.userId,isAdmin:false});await verifyAudioIntegrity(file.bytes,file.mimeType);masterVerified=true;}catch{/* Storage and format failures go to review. */}
 const contentConfirmation=beat.deliverableAsset?await prisma.auditLog.findFirst({where:{entity:"beat",entityId:String(beatId),action:"beat.master_content_confirmed",metadata:{path:["checksum"],equals:beat.deliverableAsset.checksum}},select:{metadata:true}}):null;
 const report=beatQcReport({...beat,price:beat.mp3PriceCents/100,generalPrice:beat.generalPriceCents/100,stemPrice:beat.priceCents/100,exclusivePrice:beat.exclusivePriceCents/100,audioUrl:beat.audio?.publicUrl||undefined,artworkUrl:beat.artwork?.publicUrl||undefined,contentConfirmed:(contentConfirmation?.metadata as {beatTitle?:string}|null)?.beatTitle===beat.title,sampleDeclared:Boolean(declaration&&(declaration.metadata as {sampleDeclaration?:string}|null)?.sampleDeclaration===beat.sampleDeclaration),masterVerified,evidenceCount,restricted:beat.reviewIssues!=null,storefrontReady:beat.user.role==='PRODUCER'&&beat.user.status==='ACTIVE'&&producerSetup(beat.user.producerProfile,[]).storefrontReady});
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM beats WHERE id = ${beatId} FOR UPDATE`;
  const current=await tx.beat.findUnique({where:{id:beatId},select:{updatedAt:true,status:true}});
  if(!current||current.updatedAt.getTime()!==beat.updatedAt.getTime()||current.status!==beat.status)return false;
  await tx.auditLog.create({data:{actorType:'system',actorId:beat.userId,entity:'beat',entityId:String(beatId),action:'beat.qc_checked',metadata:{...report,checkedVersion:beat.updatedAt.toISOString()}}});
  if(report.decision!=='pass')return false;
  const changed=await tx.beat.updateMany({where:{id:beatId,status:beat.status,updatedAt:beat.updatedAt},data:{status:'PUBLISHED',enabled:beat.status==='PUBLISHED'?beat.enabled:true,reviewIssues:Prisma.JsonNull}});
  if(!changed.count)return false;
  await tx.auditLog.create({data:{actorType:'system',actorId:beat.userId,action:'beat.auto_published',entity:'beat',entityId:String(beatId),metadata:{reason:'automatic_qc_pass',sampleDeclaration:beat.sampleDeclaration}}});
  return true;
 },{maxWait:5000,timeout:20000});
}
/** Bounded retry: inspect each unchanged pending version once, keep failures reviewable. */
export async function repairPendingBeatQc(){
 const cursor=await prisma.auditLog.findFirst({where:{entity:'system',entityId:'beat-qc',action:'beat.qc_sweep_cursor'},orderBy:{createdAt:'desc'},select:{metadata:true}});
 const after=Number((cursor?.metadata as {after?:number}|null)?.after||0);
 let beats=await prisma.beat.findMany({where:{id:{gt:after},status:'PENDING_REVIEW'},select:{id:true,updatedAt:true},orderBy:{id:'asc'},take:10});
 if(!beats.length)beats=await prisma.beat.findMany({where:{status:'PENDING_REVIEW'},select:{id:true,updatedAt:true},orderBy:{id:'asc'},take:10});let published=0,checked=0,last=after;
 for(const beat of beats){last=beat.id;const previous=await prisma.auditLog.findFirst({where:{entity:'beat',entityId:String(beat.id),action:'beat.qc_checked',createdAt:{gte:beat.updatedAt}},select:{id:true}});if(previous)continue;checked++;try{if(await autoPublishProducerBeat(beat.id))published++;}catch{console.error('Beat QC deferred',{beatId:beat.id});}if(checked>=3)break;}
 if(beats.length)await prisma.auditLog.create({data:{actorType:"system",entity:"system",entityId:"beat-qc",action:"beat.qc_sweep_cursor",metadata:{after:last}}});
 return {checked,published};
}
