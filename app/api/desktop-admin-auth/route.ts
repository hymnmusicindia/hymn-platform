import {NextResponse} from 'next/server';
import {getSession,createSession} from '@/lib/session';
import {getAdminAccessForPage,isRecentAdminAuthentication} from '@/lib/access';
import {isSameAppOrigin} from '@/lib/request-origin';
import {consumeRateLimit,requestIdentity} from '@/lib/rate-limit';
import {DesktopAuthError,desktopAdministrator,issueDesktopCode,redeemDesktopCode} from '@/lib/admin-desktop-auth';
import {readJsonBody,RequestBodyError} from '@/lib/request-body';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
export async function POST(request:Request){try{
  if(!isSameAppOrigin(request))return NextResponse.json({error:'Same-origin request required.'},{status:403,headers});
  const rate=await consumeRateLimit({scope:'admin-desktop-auth',identity:requestIdentity(request),limit:30,windowSeconds:300});
  if(!rate.allowed)return NextResponse.json({error:'Please wait before trying again.'},{status:429,headers});
  const raw=await readJsonBody(request,5000);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new DesktopAuthError('Invalid request.');
  const body=raw as Record<string,unknown>;
  if(body?.action==='approve'){
    const session=await getSession(),access=await getAdminAccessForPage();
    if(!session||!access?.permissions.length)throw new DesktopAuthError('Sign in with an approved administrator account.',403);
    if(!isRecentAdminAuthentication('iat' in session&&typeof session.iat==='number'?session.iat:undefined))throw new DesktopAuthError('Sign in again before connecting this computer.',401);
    await desktopAdministrator(session.sub);
    if(typeof body.challenge!=='string')throw new DesktopAuthError('Invalid challenge.');
    return NextResponse.json({code:issueDesktopCode(session.sub,body.challenge)},{headers});
  }
  if(body?.action!=='redeem'||typeof body.code!=='string'||typeof body.verifier!=='string')throw new DesktopAuthError('Invalid sign-in request.');
  const user=await redeemDesktopCode(body.code,body.verifier);
  await createSession({sub:user.id,email:user.email,name:user.name,role:'admin',avatarUrl:user.avatar},{ipAddress:requestIdentity(request),userAgent:request.headers.get('user-agent')?.slice(0,1000)});
  return NextResponse.json({signedIn:true},{headers});
}catch(error){return NextResponse.json({error:error instanceof DesktopAuthError||error instanceof RequestBodyError?error.message:'Desktop sign-in is temporarily unavailable.'},{status:error instanceof DesktopAuthError||error instanceof RequestBodyError?error.status:503,headers});}}
