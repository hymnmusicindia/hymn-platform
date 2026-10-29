import {purchasedSampleAgreements} from "./beat-sample-evidence";
import 'server-only';
import {prisma} from './prisma';
import {getBeatLicenceAgreement,type BeatLicenceAgreement} from './beat-license';
import {canDeliverBeatFile} from './beat-licence-terms';

export type BeatPurchaseDetails={sampleAgreements?:Array<{id:number;name:string;href:string}>;id:number;title:string;producer:string;artworkUrl:string|null;licenseLabel:string;purchasedAt:string;price:string;complimentary:boolean;fileFormat:string;fileReady:boolean;pdfReady:boolean;needsArtistName:boolean;artistName:string;email:string;emailState:'sent'|'pending'|'review'|'not_requested';releaseId:number|null;agreement:BeatLicenceAgreement};

export async function getBeatPurchaseDetails(id:number,userId:number):Promise<BeatPurchaseDetails|null>{
  if(!Number.isSafeInteger(id)||id<1||id>2147483647)return null;
  // Even an administrator viewing the customer dashboard sees only their own purchases.
  const p=await prisma.beatPurchase.findFirst({where:{id,userId,hasAccess:true,user:{status:'ACTIVE'}},include:{licenseAsset:true,user:{include:{artistCards:{where:{archivedAt:null},take:1}}},beat:{include:{artwork:true,deliverableAsset:true}}}});
  if(!p)return null;
  const [agreement,logs,tasks]=await Promise.all([
    getBeatLicenceAgreement(id,userId),
    prisma.emailLog.findMany({where:{entityType:'beat_purchase',entityId:String(id),userId,toEmail:p.user.email,template:'license_ready'},select:{status:true},orderBy:{createdAt:'desc'},take:20}),
    prisma.adminTask.findMany({where:{type:'Beat delivery',entityType:'beat_purchase',entityId:String(id)},select:{status:true},orderBy:{createdAt:'desc'},take:5})
  ]);
  const snapshot=p.licenseTermsSnapshot as {grantReference?:string;buyer?:{artistName?:string};price?:number}|null;
  const master=p.beat.deliverableAsset;
  const artistName=snapshot?.buyer?.artistName||'';
  return {sampleAgreements:(await purchasedSampleAgreements(id,userId)).map(asset=>({id:asset.id,name:asset.safeFilename,href:`/api/beat-purchases/${id}/sample-license?asset=${asset.id}`})),id,title:agreement.beatTitle,producer:agreement.producerName,artworkUrl:p.beat.artwork?.publicUrl||null,licenseLabel:agreement.licenceLabel,purchasedAt:p.purchasedAt.toISOString(),price:agreement.price,complimentary:Boolean(snapshot?.grantReference&&snapshot.price===0),fileFormat:master?.mimeType==='audio/mpeg'?'MP3':master?.mimeType?.includes('wav')?'WAV':master?.mimeType==='application/zip'?'Stem archive':master?.mimeType==='audio/flac'?'FLAC':'File pending',fileReady:Boolean(master&&!master.deletedAt&&canDeliverBeatFile(p.licenseType,master.mimeType)),pdfReady:Boolean(p.licenseAsset&&!p.licenseAsset.deletedAt),needsArtistName:!artistName,artistName,email:p.user.email,emailState:logs.some(l=>l.status==='sent')?'sent':logs.some(l=>l.status==='queued')||tasks.some(t=>['open','processing'].includes(t.status))?'pending':logs.some(l=>l.status==='failed')||tasks.some(t=>t.status==='review')?'review':'not_requested',releaseId:p.releaseId,agreement};
}
