import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { isSameAppOrigin } from '@/lib/request-origin';
import { consumeRateLimit, requestIdentity } from '@/lib/rate-limit';
import { supportChatContext, supportChatTickets, createChatSupportTicket } from '@/lib/support-chat';
import { answerSupportQuestion, supportServices, type SupportService } from '@/lib/support-chat-knowledge';
import { SupportError } from '@/lib/support';

export const runtime='nodejs';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
function failure(error:unknown){return reply({error:error instanceof SupportError?error.message:'Support is temporarily unavailable. Please try again.'},error instanceof SupportError?error.status:503);}

export async function GET(request:Request){
  try{
    const session=await getSession();
    if(!session)return new URL(request.url).searchParams.get('view')==='tickets'?reply({error:'Sign in to view your tickets.'},401):reply({authenticated:false,releases:[],phone:'',hasMore:false});
    const rate=await consumeRateLimit({scope:'support-chat-context',identity:String(session.sub),limit:60,windowSeconds:60});
    if(!rate.allowed)return reply({error:'Please wait a moment before searching again.'},429);
    const url=new URL(request.url),offset=Number(url.searchParams.get('offset')??0);
    if(!Number.isSafeInteger(offset)||offset<0||offset>10000)return reply({error:'Invalid page.'},400);
    if(url.searchParams.get('view')==='tickets')return reply(await supportChatTickets(session.sub,offset));
    return reply(await supportChatContext(session.sub,(url.searchParams.get('search')??'').slice(0,100),offset));
  }catch(error){return failure(error);}
}

export async function POST(request:Request){
  try{
    if(!isSameAppOrigin(request))return reply({error:'Same-origin request required.'},403);
    if(Number(request.headers.get('content-length')??0)>16000)return reply({error:'Message too large.'},413);
    const text=await request.text();if(text.length>16000)return reply({error:'Message too large.'},413);
    let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
    if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'Invalid request.'},400);
    const session=await getSession();
    if(!['answer','ticket'].includes(body.action))return reply({error:'Choose a supported action.'},400);
    if(body.action==='ticket'&&!session)return reply({error:'Sign in to raise a ticket and attach your release securely.'},401);
    const rate=await consumeRateLimit({scope:body.action==='ticket'?'support-chat-ticket':'support-chat-answer',identity:session?String(session.sub):requestIdentity(request),limit:body.action==='ticket'?10:40,windowSeconds:3600});
    if(!rate.allowed)return reply({error:'You have reached the support request limit. Please try again later.'},429);
    if(body.action==='ticket')return reply({ticket:await createChatSupportTicket(session!.sub,body)},201);
    if(typeof body.message!=='string'||!body.message.trim()||body.message.length>3000)return reply({error:'Enter a question of up to 3,000 characters.'},400);
    if(body.service!==undefined&&!supportServices.includes(body.service))return reply({error:'Choose a valid service.'},400);
    return reply({answer:answerSupportQuestion(body.message,body.service as SupportService|undefined)});
  }catch(error){return failure(error);}
}
