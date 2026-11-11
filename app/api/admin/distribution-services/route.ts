import { NextResponse } from 'next/server';
import { getPublicAppUrl } from '@/lib/public-app-url';
import { z } from 'zod';
import { requireAdminPermission,requireRecentAdminPermission } from '@/lib/access';
import { isSameAppOrigin } from '@/lib/request-origin';
import { prisma } from '@/lib/prisma';
import { reviewDistributionService,submitDistributionService,syncDistributionService,reconcileDistributionService } from '@/lib/distribution-services';
const headers={'Cache-Control':'private, no-store'};
const body=z.object({id:z.number().int().positive().max(2147483647),action:z.enum(['approve','reject','submit','sync','reconcile','complete']),note:z.string().trim().max(2000).default(''),confirmation:z.string().optional()}).strict();
export async function GET(request:Request){
  const auth=await requireAdminPermission('releases.read');if('error'in auth)return auth.error;
  const page=Math.max(1,Math.min(10000,Math.floor(Number(new URL(request.url).searchParams.get('page'))||1)));
  const requests=await prisma.releaseChangeRequest.findMany({where:{requestType:'distribution_service'},include:{release:{select:{title:true,userId:true}},events:{orderBy:{id:'desc'},take:20}},orderBy:{updatedAt:'desc'},take:25,skip:(page-1)*25});
  const webhooks=await prisma.auditLog.findMany({where:{entity:'distribution_webhook'},orderBy:{id:'desc'},take:25,select:{id:true,entityId:true,action:true,metadata:true,createdAt:true}});
  return NextResponse.json({requests,page,webhooks,webhookConfiguration:{signingConfigured:Boolean(process.env.DNM_WEBHOOK_SECRET||process.env.DIRENOTE_WEBHOOK_SECRET),endpoint:`${getPublicAppUrl()}/api/webhooks/direnote`}},{headers});
}
export async function POST(request:Request){
  if(!isSameAppOrigin(request))return NextResponse.json({error:'Same-origin request required.'},{status:403,headers});
  const parsed=body.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid service action.'},{status:400,headers});
  const input=parsed.data;
  const auth=input.action==='sync'?await requireAdminPermission('releases.read'):await requireRecentAdminPermission(input.action==='submit'?'distribution.submit':'updates.review');if('error'in auth)return auth.error;
  const row=await prisma.releaseChangeRequest.findFirst({where:{id:input.id,requestType:'distribution_service'}});
  if(!row)return NextResponse.json({error:'Request not found.'},{status:404,headers});
  const service=(row.requestedChanges as any)?.serviceOperation;
  if(service?.action==='request_takedown') {const permission=await requireRecentAdminPermission('takedowns.review');if('error'in permission)return permission.error;}
  if(input.action==='submit'&&input.confirmation!==`SEND ${input.id}`)return NextResponse.json({error:'Explicit SEND request-number confirmation required.'},{status:400,headers});
  try{
    const actorId='sub'in auth?Number(auth.sub)||null:null;
    const result=input.action==='submit'?await submitDistributionService(input.id,actorId):input.action==='sync'?await syncDistributionService(input.id):input.action==='reconcile'?await reconcileDistributionService(input.id):await reviewDistributionService(input.id,input.action,input.note,actorId);
    return NextResponse.json({request:result},{headers});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Service operation failed.'},{status:409,headers});}
}
