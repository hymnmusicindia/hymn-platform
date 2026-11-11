import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { isSameAppOrigin } from '@/lib/request-origin';
import { consumeRateLimit } from '@/lib/rate-limit';
import { applyForOac,oacArtistState,requestOacChannelChange,resumeOacPayment } from '@/lib/youtube-oac';
import { verifyRazorpaySignature,verifyCapturedRazorpayPayment } from '@/lib/razorpay';
import { confirmDistributionPayment } from '@/lib/payment-webhooks';
import { OAC_RETRY_AMOUNT,OAC_RETRY_PLAN } from '@/lib/youtube-oac-contract';
import { customerBrandText } from '@/lib/customer-message';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){
  const auth=await requireUser();if('error'in auth)return auth.error;
  const artists=await prisma.artistCard.findMany({where:{userId:auth.user.id,archivedAt:null,user:{status:'ACTIVE'}},orderBy:{artistName:'asc'},select:{id:true,artistName:true,imageUrl:true},take:200});
  const rawId=new URL(request.url).searchParams.get('artistId');
  if(rawId!==null&&(!/^\d+$/.test(rawId)||!Number.isSafeInteger(Number(rawId))||Number(rawId)<1||Number(rawId)>2147483647))return NextResponse.json({error:'Invalid artist profile.'},{status:400,headers});
  const id=rawId===null?artists[0]?.id:Number(rawId);
  if(!id)return NextResponse.json({artists,state:null},{headers});
  if(!artists.some(a=>a.id===id))return NextResponse.json({error:'Artist profile not found.'},{status:404,headers});
  try{return NextResponse.json({artists,state:await oacArtistState(auth.user.id,id)},{headers});}
  catch{return NextResponse.json({error:'OAC status is unavailable. Try refreshing.'},{status:503,headers});}
}
export async function POST(request:Request){
  if(!isSameAppOrigin(request))return NextResponse.json({error:'Same-origin request required.'},{status:403,headers});
  const auth=await requireUser();if('error'in auth)return auth.error;
  if(!await prisma.user.count({where:{id:auth.user.id,status:'ACTIVE'}}))return NextResponse.json({error:'Your account must be active.'},{status:403,headers});
  const rate=await consumeRateLimit({scope:'oac-application',identity:String(auth.user.id),limit:20,windowSeconds:900});
  if(!rate.allowed)return NextResponse.json({error:'Too many attempts. Please try later.'},{status:429,headers});
  try{
    const body=await request.json();
    if(body.action==='resume-payment'){const input=z.object({artistId:z.number().int().positive()}).parse(body);return NextResponse.json(await resumeOacPayment(auth.user.id,input.artistId),{headers});}
    if(body.action==='change-channel'){const {action,...input}=body;return NextResponse.json(await requestOacChannelChange(auth.user.id,input),{headers});}
    if(body.action==='verify-payment'){
      const payment=z.object({orderId:z.string().min(1).max(100),paymentId:z.string().min(1).max(100),signature:z.string().regex(/^[a-f0-9]{64}$/i)}).parse(body);
      const order=await prisma.distributionOrder.findUnique({where:{razorpayOrderId:payment.orderId}});
      if(!order||order.userId!==auth.user.id||order.plan!==OAC_RETRY_PLAN||order.amount!==OAC_RETRY_AMOUNT||order.currency!=='INR')throw Error('OAC payment order not found.');
      if(!verifyRazorpaySignature(payment.orderId,payment.paymentId,payment.signature))throw Error('Invalid payment signature.');
      await verifyCapturedRazorpayPayment({orderId:payment.orderId,paymentId:payment.paymentId,amountMinor:OAC_RETRY_AMOUNT*100,currency:'INR'});
      await confirmDistributionPayment({razorpayOrderId:payment.orderId,paymentId:payment.paymentId,userId:auth.user.id,amountMinor:8000,currency:'INR',source:'browser'});
      return NextResponse.json({success:true},{headers});
    }
    return NextResponse.json(await applyForOac(auth.user.id,body),{headers});
  }catch(error){return NextResponse.json({error:error instanceof z.ZodError?error.issues.map(i=>i.message).join(' '):error instanceof Error&&!error.name.startsWith('Prisma')?customerBrandText(error.message):'The application could not be saved. Refresh and try again.'},{status:400,headers});}
}
