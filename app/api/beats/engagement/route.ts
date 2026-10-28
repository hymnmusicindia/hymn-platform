import { NextRequest, NextResponse } from 'next/server';
import { beatVisitor, readBeatEngagement, writeBeatEngagement } from '@/lib/beat-engagement';
import { consumeRateLimit, requestIdentity } from '@/lib/rate-limit';
import { isSameAppOrigin } from '@/lib/request-origin';

export const runtime='nodejs';
const cookieName='hymn-beat-visitor';
function response(body:unknown,visitor:ReturnType<typeof beatVisitor>) {
  const result=NextResponse.json(body,{headers:{'Cache-Control':'private, no-store'}});
  if(visitor.fresh)result.cookies.set(cookieName,visitor.cookie,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:31536000});
  return result;
}
export async function GET(request:NextRequest) {
  const raw=request.nextUrl.searchParams.get('ids')||'';
  if(!/^\d+(,\d+){0,99}$/.test(raw))return NextResponse.json({error:'Select up to 100 beats.'},{status:400});
  const ids=[...new Set(raw.split(',').map(Number))];
  if(ids.some(id=>!Number.isSafeInteger(id)||id<=0))return NextResponse.json({error:'Invalid beat.'},{status:400});
  const limit=await consumeRateLimit({scope:'beat-counts',identity:requestIdentity(request),limit:120,windowSeconds:60});
  if(!limit.allowed)return NextResponse.json({error:'Please retry shortly.'},{status:429});
  try{const visitor=beatVisitor(request.cookies.get(cookieName)?.value);return response({counts:await readBeatEngagement(ids,visitor.key)},visitor);}
  catch{return NextResponse.json({error:'Beat counts are temporarily unavailable.'},{status:503});}
}
export async function POST(request:NextRequest) {
  if(!isSameAppOrigin(request))return NextResponse.json({error:'Request origin is not allowed.'},{status:403});
  const input=await request.json().catch(()=>null);
  if(!input||!Number.isSafeInteger(input.beatId)||input.beatId<=0||!['view','like'].includes(input.action)||input.action==='like'&&typeof input.liked!=='boolean')return NextResponse.json({error:'Invalid beat interaction.'},{status:400});
  const limit=await consumeRateLimit({scope:'beat-interaction',identity:requestIdentity(request),limit:90,windowSeconds:60});
  if(!limit.allowed)return NextResponse.json({error:'Please retry shortly.'},{status:429});
  try{const visitor=beatVisitor(request.cookies.get(cookieName)?.value),counts=await writeBeatEngagement(input.beatId,visitor.key,input.action,input.liked);return counts?response({counts},visitor):NextResponse.json({error:'Beat unavailable.'},{status:404});}
  catch{return NextResponse.json({error:'Could not save this interaction. Please retry.'},{status:503});}
}
