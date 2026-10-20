import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { producerSetup } from '@/lib/producer-setup';
import { validateBeatReadiness } from '@/lib/beat-readiness';

const unlockWhere = (userId:number) => ({ entity:'producer', entityId:String(userId), action:'producer.beats_auto_publish_unlocked' });
/** An explicit first approval unlocks future uploads. Legacy approved inventory also qualifies. */
export async function producerHasApprovedBeat(userId:number) {
  const unlock=await prisma.auditLog.findFirst({where:unlockWhere(userId),select:{id:true}});
  if(unlock)return true;
  return Boolean(await prisma.beat.findFirst({where:{userId,status:{in:['PUBLISHED','EXCLUSIVE_RESERVED','EXCLUSIVELY_SOLD']}},select:{id:true}}));
}

/** Called only after assets and metadata have been saved; never publishes rejected or sold inventory. */
export async function autoPublishProducerBeat(beatId:number) {
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM beats WHERE id = ${beatId} FOR UPDATE`;
    const beat=await tx.beat.findUnique({where:{id:beatId},include:{audio:true,user:{include:{producerProfile:true}}}});
    if(!beat || !['PENDING_REVIEW','PUBLISHED'].includes(beat.status) || beat.reviewIssues != null || beat.sampleDeclaration!=='NO_UNCONTROLLED_SAMPLES')return false;
    if(beat.user.role!=='PRODUCER' || beat.user.status!=='ACTIVE' || !producerSetup(beat.user.producerProfile,[]).storefrontReady)return false;
    const readiness=validateBeatReadiness({...beat,price:beat.mp3PriceCents/100,generalPrice:beat.generalPriceCents/100,stemPrice:beat.priceCents/100,exclusivePrice:beat.exclusivePriceCents/100,audioUrl:beat.audio?.publicUrl ?? undefined});
    if(!readiness.ready)return false;
    const unlock=await tx.auditLog.findFirst({where:unlockWhere(beat.userId),select:{id:true}});
    const approved=unlock ? null : await tx.beat.findFirst({where:{userId:beat.userId,status:{in:['PUBLISHED','EXCLUSIVE_RESERVED','EXCLUSIVELY_SOLD']}},select:{id:true}});
    if(!unlock && !approved)return false;
    if(!unlock)await tx.auditLog.create({data:{actorType:'system',...unlockWhere(beat.userId),metadata:{firstApprovedBeatId:approved!.id,source:'existing_approved_inventory'}}});
    const changed=await tx.beat.updateMany({where:{id:beatId,status:beat.status},data:{status:'PUBLISHED',enabled:beat.status==='PUBLISHED' ? beat.enabled : true,reviewIssues:Prisma.JsonNull}});
    if(!changed.count)return false;
    await tx.auditLog.create({data:{actorType:'system',actorId:beat.userId,action:'beat.auto_published',entity:'beat',entityId:String(beatId),metadata:{reason:'producer_first_beat_approved',sampleDeclaration:beat.sampleDeclaration}}});
    return true;
  });
}
