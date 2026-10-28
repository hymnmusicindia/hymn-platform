import 'server-only';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { getUserSessionSecret } from './env';

export type BeatEngagementCounts = { views: number; likes: number; liked: boolean };
const signature=(id:string)=>createHmac('sha256',getUserSessionSecret()).update(`HYMN-beat-visitor:${id}`).digest('hex');
export function beatVisitor(cookie?:string) {
  const [id='',proof='']=cookie?.split('.')||[];
  if(/^[a-f0-9-]{36}$/.test(id)&&/^[a-f0-9]{64}$/.test(proof)&&timingSafeEqual(Buffer.from(proof,'hex'),Buffer.from(signature(id),'hex')))return {cookie:cookie!,key:signature(id),fresh:false};
  const next=randomUUID();return {cookie:`${next}.${signature(next)}`,key:signature(next),fresh:true};
}
export async function readBeatEngagement(ids:number[],visitorKey:string,db:Prisma.TransactionClient=prisma) {
  const beats=await db.beat.findMany({where:{id:{in:ids},enabled:true,status:{in:['PUBLISHED','EXCLUSIVE_RESERVED']}},select:{id:true}});
  const allowed=beats.map(beat=>beat.id);
  if(!allowed.length)return {} as Record<number,BeatEngagementCounts>;
  const [counts,liked]=await Promise.all([
    db.$queryRaw<{beatId:number;views:number;likes:number}[]>`SELECT beat_id AS "beatId", COUNT(viewed_at)::integer AS views, COUNT(*) FILTER (WHERE liked)::integer AS likes FROM beat_engagements WHERE beat_id IN (${Prisma.join(allowed)}) GROUP BY beat_id`,
    db.beatEngagement.findMany({where:{beatId:{in:allowed},visitorKey,liked:true},select:{beatId:true}}),
  ]);
  const likedIds=new Set(liked.map(row=>row.beatId)),byId=new Map(counts.map(row=>[row.beatId,row]));
  return Object.fromEntries(allowed.map(id=>[id,{views:byId.get(id)?.views||0,likes:byId.get(id)?.likes||0,liked:likedIds.has(id)}])) as Record<number,BeatEngagementCounts>;
}
export async function writeBeatEngagement(beatId:number,visitorKey:string,action:'view'|'like',liked?:boolean) {
  return prisma.$transaction(async tx=>{
    if(!await tx.beat.findFirst({where:{id:beatId,enabled:true,status:{in:['PUBLISHED','EXCLUSIVE_RESERVED']}},select:{id:true}}))return null;
    const data=action==='view'?{viewedAt:new Date()}:{liked:liked===true};
    await tx.beatEngagement.upsert({where:{beatId_visitorKey:{beatId,visitorKey}},create:{beatId,visitorKey,...data},update:data});
    return (await readBeatEngagement([beatId],visitorKey,tx))[beatId];
  });
}
