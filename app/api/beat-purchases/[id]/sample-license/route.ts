import {NextResponse} from 'next/server';
import {requireUser} from '@/lib/access';
import {readPurchasedSampleAgreement} from '@/lib/beat-sample-evidence';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const actor=await requireUser();if('error' in actor)return actor.error;
 const id=Number((await params).id),assetId=Number(new URL(request.url).searchParams.get('asset'));
 if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(assetId)||assetId<1)return NextResponse.json({error:'Agreement not found.'},{status:404});
 try{const file=await readPurchasedSampleAgreement(id,actor.user.id,assetId);return new NextResponse(new Uint8Array(file.bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${file.fileName.replace(/["\\\r\n]/g,'_')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'}});}catch{return NextResponse.json({error:'Sample agreement unavailable. Retry or contact HYMN support.'},{status:404});}
}
