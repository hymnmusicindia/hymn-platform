import {purchaseDelivery} from "@/lib/beat-file-fulfilment";
import {assertMasterIdentity} from "@/lib/beat-delivery-identity";
import {NextResponse} from 'next/server';
import {requireUser} from '@/lib/access';
import {prisma} from '@/lib/prisma';
import {AudioRangeNotSatisfiableError,localPrivateStorage} from '@/lib/private-storage';
import {canDeliverBeatFile} from '@/lib/beat-licence-terms';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const actor=await requireUser();if('error'in actor)return actor.error;
  const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:'Purchase not found.'},{status:404});
  const purchase=await prisma.beatPurchase.findUnique({where:{id},include:{beat:{include:{deliverableAsset:true}}}});
  if(!purchase||purchase.userId!==actor.user.id)return NextResponse.json({error:'Purchase not found.'},{status:404});
  if(!purchase.hasAccess)return NextResponse.json({error:'Download access has been revoked.'},{status:403});
  let asset;try{asset=(await purchaseDelivery(id,actor.user.id)).asset;}catch{return NextResponse.json({error:"Delivery verification failed. Contact HYMN support."},{status:409});}
  if(!asset||asset.deletedAt||!canDeliverBeatFile(purchase.licenseType,asset.mimeType))return NextResponse.json({error:'The producer is processing your requested file. It will be delivered to you shortly.'},{status:409});
  try{
    assertMasterIdentity(purchase,purchase.beat.userId,asset);
    const file=await localPrivateStorage.createAuthorizedRead({assetId:asset.id,requesterUserId:actor.user.id,isAdmin:false,range:request.headers.get('range')});
    await prisma.beatPurchase.update({where:{id},data:{downloadedAt:new Date(),downloadCount:{increment:1}}});
    return new NextResponse(new Uint8Array(file.bytes),{status:file.contentRange?206:200,headers:{'Content-Type':file.mimeType,'Content-Disposition':`attachment; filename="${file.fileName.replace(/["\\\r\n]/g,'_')}"`,'Content-Length':String(file.bytes.length),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Accept-Ranges':'bytes',...(file.contentRange?{'Content-Range':file.contentRange}:{})}});
  }catch(error){
    if(error instanceof AudioRangeNotSatisfiableError)return new NextResponse(null,{status:416,headers:{'Content-Range':`bytes */${error.size}`,'Cache-Control':'no-store'}});
    return NextResponse.json({error:'The file could not be read. Please retry or contact HYMN support.'},{status:503});
  }
}
