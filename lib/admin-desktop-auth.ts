import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { getUserSessionSecret } from '@/lib/env';
import { isConfiguredAdminEmail } from '@/lib/auth-role';
import { consumeRateLimit } from '@/lib/rate-limit';

const purpose='hymn-admin-desktop-v1';
export class DesktopAuthError extends Error { constructor(message:string,readonly status=400){super(message);} }
export function desktopChallenge(verifier:string){return createHash('sha256').update(verifier).digest('base64url');}
export async function desktopAdministrator(id:number){
  const user=await prisma.user.findUnique({where:{id},include:{adminMembership:{include:{role:{include:{permissions:{include:{permission:true}}}}}}}});
  if(!user||user.status!=='ACTIVE'||user.role!=='ADMIN')throw new DesktopAuthError('Active administrator access is required.',403);
  const member=user.adminMembership;
  if(member?(!member.active||!!member.revokedAt||!member.role.permissions.length):!isConfiguredAdminEmail(user.email))throw new DesktopAuthError('Administrator access is unavailable or revoked.',403);
  return user;
}
export function issueDesktopCode(userId:number,challenge:string){
  if(!/^[A-Za-z0-9_-]{43}$/.test(challenge))throw new DesktopAuthError('Invalid pairing challenge.');
  return jwt.sign({purpose,uid:userId,challenge},getUserSessionSecret(),{algorithm:'HS256',audience:purpose,issuer:'hymn',jwtid:randomUUID(),expiresIn:60});
}
export async function redeemDesktopCode(code:string,verifier:string){
  if(!/^[A-Za-z0-9_-]{43,128}$/.test(verifier)||code.length>2000)throw new DesktopAuthError('Invalid sign-in handoff.');
  let claims;try{const value=jwt.verify(code,getUserSessionSecret(),{algorithms:['HS256'],audience:purpose,issuer:'hymn',maxAge:60});if(typeof value==='string'||value.purpose!==purpose||!Number.isSafeInteger(value.uid)||typeof value.jti!=='string'||value.challenge!==desktopChallenge(verifier))throw new Error();claims=value;}catch{throw new DesktopAuthError('Sign-in expired or does not match this app. Start again.',401);}
  const user=await desktopAdministrator(Number(claims.uid));
  const used=await consumeRateLimit({scope:'admin-desktop-handoff-used',identity:claims.jti!,limit:1,windowSeconds:180});
  if(!used.allowed)throw new DesktopAuthError('This sign-in has already been used. Start again.',401);
  return user;
}
