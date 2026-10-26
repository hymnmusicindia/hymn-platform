import {after,NextResponse} from 'next/server';
import {z} from 'zod';
import {requireRecentAdminPermission} from '@/lib/access';
import {isSameAppOrigin} from '@/lib/request-origin';
import {referralJson} from '@/lib/referral-request';
import {prisma} from '@/lib/prisma';
import {deliverReferralMail} from '@/lib/referral-mail';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!isSameAppOrigin(request))return NextResponse.json({error:'Same-origin request required.'},{status:403});
  const admin=await requireRecentAdminPermission('wallets.adjust');if('error' in admin)return admin.error;
  const data=z.object({action:z.enum(['retry','cancel']),note:z.string().trim().min(12).max(1000),deliveryLogsReviewed:z.literal(true)}).safeParse(await referralJson(request));
  const id=Number((await params).id);
  if(!data.success||!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:'Confirm the delivery logs were checked and record your decision.'},{status:400});
  const result=await prisma.$transaction(async tx=>{
    const updated=await tx.referralMailJob.updateMany({where:{id,status:'REVIEW'},data:{status:data.data.action==='retry'?'PENDING':'CANCELLED',attempts:0,lockedAt:null,lastError:null,availableAt:new Date()}});
    if(updated.count)await tx.auditLog.create({data:{actorType:'admin',actorId:'sub' in admin?Number(admin.sub):null,action:'REFERRAL_MAIL_REVIEWED',entity:'referral_mail_job',entityId:String(id),metadata:data.data}});
    return updated.count;
  });
  if(!result)return NextResponse.json({error:'This message is no longer awaiting review.'},{status:409});
  if(data.data.action==='retry')after(()=>deliverReferralMail().then(()=>undefined));
  return NextResponse.json({success:true});
}
