import {NextResponse} from 'next/server';
import {prisma} from '@/lib/prisma';
import {readPublicBeatLicencePdf} from '@/lib/beat-license';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const id=Number((await params).id);
 if(!Number.isSafeInteger(id)||id<1||id>2147483647)return NextResponse.json({error:'Licence not found.'},{status:404});
 try{
  const purchase=await prisma.beatPurchase.findUnique({where:{id},select:{hasAccess:true}});
  if(!purchase)return NextResponse.json({error:'Licence not found.'},{status:404});
  if(!purchase.hasAccess)return NextResponse.json({error:'Licence access has been revoked.'},{status:403});
  const asset=await readPublicBeatLicencePdf(id);
  return new NextResponse(new Uint8Array(asset.bytes),{headers:{
   'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${asset.fileName.replace(/["\\]/g,'_')}"`,
   'Content-Length':String(asset.bytes.length),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'
  }});
 }catch(error){
  if(error instanceof Error&&error.message==='Beat licence not found.')return NextResponse.json({error:'Licence not found.'},{status:404});
  return NextResponse.json({error:'The licence PDF could not be read. Please retry or contact HYMN support.'},{status:503});
 }
}
