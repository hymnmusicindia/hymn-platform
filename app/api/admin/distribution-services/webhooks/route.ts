import { after,NextResponse } from 'next/server';
import { requireRecentAdminPermission } from '@/lib/access';
import { isSameAppOrigin } from '@/lib/request-origin';
import { prisma } from '@/lib/prisma';
import { processDistributionWebhookQueue } from '@/lib/distribution-webhooks';
export async function POST(request:Request){
  if(!isSameAppOrigin(request))return NextResponse.json({error:'Same-origin required.'},{status:403});
  const auth=await requireRecentAdminPermission('system.manage');if('error'in auth)return auth.error;
  const id=Number((await request.json().catch(()=>null))?.id);if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:'Invalid event.'},{status:400});
  const event=await prisma.auditLog.findFirst({where:{id,entity:'distribution_webhook',action:{in:['DISTRIBUTION_WEBHOOK_RETRY','DISTRIBUTION_WEBHOOK_REVIEW']}}});
  if(!event)return NextResponse.json({error:'Event is not eligible for reconciliation.'},{status:409});
  const changed=await prisma.auditLog.updateMany({where:{id,action:event.action},data:{action:'DISTRIBUTION_WEBHOOK_RECEIVED',metadata:{...event.metadata as Record<string,any>,attempts:0}}});
  if(!changed.count)return NextResponse.json({error:'Event changed concurrently.'},{status:409});
  await prisma.auditLog.create({data:{action:'DISTRIBUTION_WEBHOOK_RETRY_REQUESTED',entity:'distribution_webhook_retry',entityId:String(id),actorType:'admin',actorId:'sub'in auth?Number(auth.sub)||null:null,metadata:{readOnly:true}}});
  after(async()=>{await processDistributionWebhookQueue(1).catch(()=>undefined);});return NextResponse.json({queued:true});
}
