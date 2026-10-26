import {after,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {z} from 'zod';
import {prisma} from '@/lib/prisma';
import {getSession} from '@/lib/session';
import {isSameAppOrigin} from '@/lib/request-origin';
import {consumeRateLimit} from '@/lib/rate-limit';
import {referralJson} from '@/lib/referral-request';
import {ReferralConsentError,approveReferral,previewReferral,referralConnections,removeReferral} from '@/lib/referral-consent';
import {REFERRAL_ATTRIBUTION_COOKIE,REFERRAL_SIGNUP_TRANSACTION_OPTIONS} from '@/lib/referrals';
import {ACQUISITION_ATTRIBUTION_COOKIE} from '@/lib/acquisition-revenue';
import {deliverReferralMail} from '@/lib/referral-mail';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store'};
export async function GET(){
  const session=await getSession();if(!session)return NextResponse.json({error:'Sign in to review your referral.'},{status:401,headers});
  const connections=await referralConnections(session.sub);
  const code=(await cookies()).get(REFERRAL_ATTRIBUTION_COOKIE)?.value;
  let invitation=null,invitationError='';
  if(code)try{invitation=await previewReferral(session.sub,code);}catch(e){invitationError=e instanceof ReferralConsentError?e.message:'Could not load this invitation. Please retry.';}
  return NextResponse.json({connections,invitation,invitationError,hasInvitation:Boolean(code)},{headers});
}
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('preview'),code:z.string().trim().regex(/^[a-zA-Z0-9]{2,64}$/)}),
  z.object({action:z.literal('approve'),proof:z.string().min(20).max(3000),confirmed:z.literal(true)}),
  z.object({action:z.literal('remove'),kind:z.enum(['CUSTOMER','EMPLOYEE']),id:z.string().min(1).max(80),confirmed:z.literal(true)}),
  z.object({action:z.literal('decline')}),
]);
export async function POST(request:Request){
  if(!isSameAppOrigin(request))return NextResponse.json({error:'Same-origin request required.'},{status:403,headers});
  const session=await getSession();if(!session)return NextResponse.json({error:'Sign in to manage your referral.'},{status:401,headers});
  const rate=await consumeRateLimit({scope:'referral.consent',identity:String(session.sub),limit:20,windowSeconds:300});
  if(!rate.allowed)return NextResponse.json({error:'Please wait before trying again.'},{status:429,headers});
  const parsed=schema.safeParse(await referralJson(request));if(!parsed.success)return NextResponse.json({error:'Review the invitation and confirm your choice.'},{status:400,headers});
  try{
    const data=parsed.data;
    if(data.action==='preview')return NextResponse.json({invitation:await previewReferral(session.sub,data.code)},{headers});
    const result=data.action==='decline'?{declined:true}:await prisma.$transaction(async tx=>data.action==='approve'?await approveReferral(tx,session.sub,data.proof):await removeReferral(tx,session.sub,data.kind,data.id),REFERRAL_SIGNUP_TRANSACTION_OPTIONS);
    const store=await cookies();store.delete(REFERRAL_ATTRIBUTION_COOKIE);store.delete(ACQUISITION_ATTRIBUTION_COOKIE);
    if(data.action!=='decline')after(()=>deliverReferralMail().then(()=>undefined));
    return NextResponse.json({success:true,...result},{headers});
  }catch(e){
    const message=e instanceof ReferralConsentError?e.message:'Your connection changed. Refresh before trying again.';
    return NextResponse.json({error:message},{status:409,headers});
  }
}
