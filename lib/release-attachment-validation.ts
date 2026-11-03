import 'server-only';
import {prisma} from './prisma';
import {storedAssetIdFromUrl} from './release-media';

/** Uploaded documents are owned assets; explicitly supplied external proof links remain links. */
export async function validateReleaseDocument(input:{userId:number;value?:string|null;kind:'cover'|'ownership'|'ai';allowLink?:boolean},db:Pick<typeof prisma,'storedAsset'>=prisma) {
  const value=input.value?.trim();if(!value)return undefined;
  const label=input.kind==='cover'?'Cover licence':input.kind==='ai'?'AI receipt':'Rights document';
  const id=storedAssetIdFromUrl(value);
  if(!id) {
    if(input.allowLink && /^https?:\/\//i.test(value)) { const u=new URL(value);if(!u.username&&!u.password&&value.length<=2048)return value; }
    throw Error(`${label} is unavailable. Upload the document again.`);
  }
  const asset=await db.storedAsset.findFirst({where:{id,ownerUserId:input.userId,deletedAt:null,uploadStatus:'ready'},select:{id:true,safeFilename:true,mimeType:true,assetType:true}});
  const types=input.kind==='cover'?['private_cover_licence']:input.kind==='ai'?['private_ai_receipt','private_ownership_proof']:['private_ownership_proof','private_beat_license'];
  const valid=asset && types.includes(asset.assetType) && (input.kind==='cover'? ({'application/pdf':/\.pdf$/i,'image/jpeg':/\.jpe?g$/i,'image/png':/\.png$/i} as Record<string,RegExp>)[asset.mimeType]?.test(asset.safeFilename):asset.mimeType==='application/pdf'&&/\.pdf$/i.test(asset.safeFilename));
  if(!valid)throw Error(`${label} is unavailable or has an unsupported format. Upload the document again.`);
  return `/api/assets/${asset.id}/download?filename=${encodeURIComponent(asset.safeFilename)}`;
}
