import {NextResponse} from 'next/server';
import {requireAdminPermission} from '@/lib/access';
import {prisma} from '@/lib/prisma';
import {autoPublishProducerBeat} from '@/lib/beat-publication';
export async function POST(request:Request){
 const actor=await requireAdminPermission('users.manage');if('error'in actor)return actor.error;
 const body=await request.json().catch(()=>({})),id=Number(body.beatId);
 if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:'Invalid beat.'},{status:400});
 try{const beat=await prisma.beat.findUnique({where:{id},select:{status:true,updatedAt:true}});if(!beat)return NextResponse.json({error:'Beat not found.'},{status:404});if(!['PENDING_REVIEW','PUBLISHED'].includes(beat.status))return NextResponse.json({error:'This beat needs its current correction or restriction reviewed before automatic publication.'},{status:409});const published=await autoPublishProducerBeat(id);const latest=await prisma.auditLog.findFirst({where:{entity:'beat',entityId:String(id),action:'beat.qc_checked',createdAt:{gte:beat.updatedAt}},orderBy:{createdAt:'desc'},select:{metadata:true}});return NextResponse.json({published,report:latest?.metadata||null});}catch{return NextResponse.json({error:'QC is temporarily unavailable. The review queue remains available; retry this check.'},{status:503});}
}
