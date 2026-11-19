import {NextResponse} from 'next/server';
import {getSession} from '@/lib/session';
import {desktopWorkspaceAccess} from '@/lib/admin-desktop-auth';
import {GET as releaseArtwork} from '@/app/api/releases/[id]/artwork/route';
export const runtime='nodejs';
export async function GET(request:Request){
  try{const session=await getSession();if(!session)return new NextResponse(null,{status:401});const access=await desktopWorkspaceAccess(session.sub);if(!access.permissions.some(p=>['releases.read','releases.review','distribution.retry'].includes(p)))return new NextResponse(null,{status:403});const id=new URL(request.url).searchParams.get('releaseId');if(!id||!/^[1-9]\d*$/.test(id))return new NextResponse(null,{status:400});const url=new URL(request.url);url.searchParams.set('w','192');const result=await releaseArtwork(new Request(url,{headers:request.headers}),{params:Promise.resolve({id})});result.headers.set('Cache-Control','private, no-store');return result;}catch{return new NextResponse(null,{status:403});}
}
