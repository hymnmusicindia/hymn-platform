import 'server-only';
import { NextResponse } from 'next/server';
import { requireUser, requireAdminPermission } from '@/lib/access';
import { prisma } from '@/lib/prisma';

type QcAccess={error:NextResponse}|{release:{id:number;userId:number;title:string;upc:string|null;status:string;correctionReason:string|null;tracks:Array<{id:number;audioUrl:string|null}>}};
export async function releaseQcAccess(releaseId:number):Promise<QcAccess>{
  const user=await requireUser();
  if('error' in user){const admin=await requireAdminPermission('releases.read');if('error' in admin)return {error:user.error};}
  if(!Number.isSafeInteger(releaseId)||releaseId<1)return {error:NextResponse.json({error:'Release not found.'},{status:404})};
  const release=await prisma.release.findUnique({where:{id:releaseId},select:{id:true,userId:true,title:true,upc:true,status:true,correctionReason:true,tracks:{select:{id:true,audioUrl:true}}}});
  if(!release)return {error:NextResponse.json({error:'Release not found.'},{status:404})};
  if(!('error' in user)&&release.userId!==user.user.id){const admin=await requireAdminPermission('releases.read');if('error' in admin)return {error:NextResponse.json({error:'Release not found.'},{status:404})};}
  return {release};
}
