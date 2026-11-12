import 'server-only';
import { prisma } from './prisma';

const publicProducer = { active:true, status:'active', user:{status:'ACTIVE' as const,role:{in:['PRODUCER','ADMIN'] as ('PRODUCER'|'ADMIN')[]}} };
export class ProducerFollowError extends Error {
  constructor(message:string,public status:number){super(message);}
}

export async function producerFollowStates(ids:number[],viewerId?:number){
  const profiles=await prisma.producerProfile.findMany({where:{id:{in:ids},...publicProducer},select:{id:true,userId:true}});
  const visible=profiles.map(p=>p.id);
  const [counts,following]=await Promise.all([
    prisma.producerFollow.groupBy({by:['producerProfileId'],where:{producerProfileId:{in:visible}},_count:{_all:true}}),
    viewerId?prisma.producerFollow.findMany({where:{followerUserId:viewerId,producerProfileId:{in:visible}},select:{producerProfileId:true}}):[]
  ]);
  const totals=new Map(counts.map(row=>[row.producerProfileId,row._count._all]));
  const followed=new Set(following.map(row=>row.producerProfileId));
  return profiles.map(profile=>({id:profile.id,count:totals.get(profile.id)||0,following:followed.has(profile.id),own:profile.userId===viewerId}));
}

/** Explicit desired state and a composite key make repeated requests safe. */
export async function setProducerFollow(viewerId:number,producerId:number,following:boolean){
  await prisma.$transaction(async tx=>{
    const user=await tx.user.findUnique({where:{id:viewerId},select:{status:true}});
    if(user?.status!=='ACTIVE')throw new ProducerFollowError('Your account is not available for following.',403);
    const producer=await tx.producerProfile.findFirst({where:{id:producerId,...publicProducer},select:{userId:true}});
    if(!producer)throw new ProducerFollowError('This producer is no longer available.',404);
    if(producer.userId===viewerId)throw new ProducerFollowError('This is your producer profile.',409);
    if(following)await tx.producerFollow.createMany({data:[{followerUserId:viewerId,producerProfileId:producerId}],skipDuplicates:true});
    else await tx.producerFollow.deleteMany({where:{followerUserId:viewerId,producerProfileId:producerId}});
  });
  return (await producerFollowStates([producerId],viewerId))[0];
}
