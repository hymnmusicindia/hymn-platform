import {NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {getSession} from '@/lib/session';
import {desktopWorkspaceAccess,DesktopAuthError} from '@/lib/admin-desktop-auth';
import {GET as adminEvents} from '@/app/api/admin/desktop/events/route';
import {prisma} from '@/lib/prisma';
import {consumeRateLimit} from '@/lib/rate-limit';
import {desktopBrief} from '@/lib/desktop-alert-text';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){try{
  const session=await getSession();if(!session)return NextResponse.json({error:'Sign in required.'},{status:401,headers});
  const access=await desktopWorkspaceAccess(session.sub),q=new URL(request.url).searchParams,view=q.get('view')==='inbox',channel=q.get('channel')??'admin';
  const rate=await consumeRateLimit({scope:'desktop-staff-events',identity:String(session.sub),limit:180,windowSeconds:60});if(!rate.allowed)return NextResponse.json({error:'Please wait.'},{status:429,headers});
  const capabilities={admin:access.permissions.length>0,team:access.teams.length>0};
  const identity=createHash('sha256').update(JSON.stringify([session.sub,[...access.permissions].sort(),access.teams.map(m=>[m.id,m.roleId,m.role.permissions,m.preferences]).sort()])).digest('hex');
  async function admin(){if(!capabilities.admin)return {events:[],until:new Date(Date.now()-3000).toISOString(),next:null};const res=await adminEvents(request);if(!res.ok)throw new Error('Admin feed unavailable.');return res.json();}
  async function team(){
    const now=Date.now()-3000,until=new Date(q.get('until')??now),since=new Date(q.get('since')??until.getTime()-(view?7*86400000:120000)),after=q.get('after')??'';
    if(!Number.isFinite(since.getTime())||!Number.isFinite(until.getTime())||since>until||until.getTime()>Date.now()+5000||until.getTime()-since.getTime()>7*86400000||after.length>80||!/^[a-zA-Z0-9_-]*$/.test(after))throw new DesktopAuthError('Invalid event window.');
    const members=access.teams.filter(m=>view||(m.preferences as {notifications?:boolean}|null)?.notifications!==false);
    const rows=await prisma.teamNotification.findMany({where:{memberId:{in:members.map(m=>m.id)},createdAt:{lte:until},OR:[{createdAt:{gt:since}},{createdAt:since,id:{gt:after}}]},orderBy:[{createdAt:view?'desc':'asc'},{id:view?'desc':'asc'}],take:101,include:{member:{select:{workspaceId:true,workspace:{select:{name:true}}}}}});
    const page=rows.slice(0,100),last=page.at(-1);
    const events=page.map(n=>{let url;try{url=new URL(n.href,'https://hymnmusic.fun');}catch{return null;}if(url.origin!=='https://hymnmusic.fun'||url.username||url.password||!(url.pathname==='/team'||url.pathname.startsWith('/team/'))||/^\/team\/(?:login|sign-in)(?:\/|$)/.test(url.pathname))return null;url.searchParams.set('workspace',n.member.workspaceId);return {key:`team:${n.id}`,category:'team',title:desktopBrief(n.title,150),body:desktopBrief(`${n.member.workspace.name} · ${/message|chat/i.test(n.title)?'New team message':/task|work|review|approval/i.test(n.title)?'Work or review update':'Team update'}. Open Team OS for details.`,260),href:url.pathname+url.search,at:n.createdAt.toISOString(),imageUrl:null};}).filter(Boolean);
    return {events,until:until.toISOString(),next:!view&&rows.length>100&&last?{since:last.createdAt.toISOString(),after:last.id}:null};
  }
  if(view){const [a,t]=await Promise.all([admin(),team()]);return NextResponse.json({identity,capabilities,events:[...a.events,...t.events].sort((a,b)=>Date.parse(b.at??'')-Date.parse(a.at??'')).slice(0,100)},{headers});}
  if(!['admin','team'].includes(channel))throw new DesktopAuthError('Choose a workspace channel.');
  return NextResponse.json({...await(channel==='team'?team():admin()),identity,capabilities},{headers});
}catch(error){return NextResponse.json({error:error instanceof DesktopAuthError?error.message:'Workspace updates are temporarily unavailable.'},{status:error instanceof DesktopAuthError?error.status:503,headers});}}
