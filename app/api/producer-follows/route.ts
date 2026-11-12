import { NextRequest,NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { isSameAppOrigin } from '@/lib/request-origin';
import { consumeRateLimit,requestIdentity } from '@/lib/rate-limit';
import { ProducerFollowError,producerFollowStates,setProducerFollow } from '@/lib/producer-follows';

export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
export async function GET(request:NextRequest){
  const raw=request.nextUrl.searchParams.get('ids')||'';
  if(!/^\d+(,\d+){0,47}$/.test(raw))return NextResponse.json({error:'Choose up to 48 producers.'},{status:400,headers});
  const ids=[...new Set(raw.split(',').map(Number))];
  if(ids.some(id=>!Number.isSafeInteger(id)||id<=0))return NextResponse.json({error:'Invalid producer.'},{status:400,headers});
  const limit=await consumeRateLimit({scope:'producer-follow-read',identity:requestIdentity(request),limit:120,windowSeconds:60});
  if(!limit.allowed)return NextResponse.json({error:'Please retry shortly.'},{status:429,headers});
  try{const user=await getSession();return NextResponse.json({producers:await producerFollowStates(ids,user?.sub),authenticated:Boolean(user)},{headers});}
  catch{return NextResponse.json({error:'Following is temporarily unavailable.'},{status:503,headers});}
}
export async function POST(request:NextRequest){
  if(!isSameAppOrigin(request))return NextResponse.json({error:'Request origin is not allowed.'},{status:403,headers});
  const user=await getSession();
  if(!user)return NextResponse.json({error:'Sign in to follow producers.'},{status:401,headers});
  const body=await request.json().catch(()=>null);
  if(!body||!Number.isSafeInteger(body.producerId)||body.producerId<=0||typeof body.following!=='boolean')return NextResponse.json({error:'Invalid follow request.'},{status:400,headers});
  const limit=await consumeRateLimit({scope:'producer-follow-write',identity:String(user.sub),limit:60,windowSeconds:60});
  if(!limit.allowed)return NextResponse.json({error:'Please retry shortly.'},{status:429,headers});
  try{return NextResponse.json({producer:await setProducerFollow(user.sub,body.producerId,body.following)},{headers});}
  catch(error){return NextResponse.json({error:error instanceof ProducerFollowError?error.message:'Could not save your follow. Please retry.'},{status:error instanceof ProducerFollowError?error.status:503,headers});}
}
