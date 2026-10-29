import {verifyRequestedBeatFile} from "../beat-requested-file-validation";
import {purchaseDelivery} from "../beat-file-fulfilment";
import {assertMasterIdentity,assertLicenceAsset,verifyAgreementBytes,agreementIdentity} from "../beat-delivery-identity";
import {createHash} from 'node:crypto';
import {purchasedSampleAgreements,readPurchasedSampleAgreement} from "../beat-sample-evidence";
import "server-only";
import { prisma } from "@/lib/prisma";
import { localPrivateStorage } from "@/lib/private-storage";
import type { EmailAttachment } from "./email-client";
import {canDeliverBeatFile} from '../beat-licence-terms';

// Keep raw files below 10 MiB: MIME/base64 expands the transmitted message.
export async function purchaseAttachments(purchaseId: number, userId: number, recipient: string): Promise<EmailAttachment[]> {
  const purchase = await prisma.beatPurchase.findFirst({
    where: { id: purchaseId, userId, hasAccess: true },
    include: { user: { select: { email: true } }, licenseAsset: true, beat: { include: { deliverableAsset: true } } }
  });
  if (!purchase || purchase.user.email.toLowerCase() !== recipient.toLowerCase()) return [];
  const delivery=await purchaseDelivery(purchaseId,userId);
  if(!delivery.ready)throw Error("The producer is processing the requested file; ready-file email is blocked.");
  const master=delivery.asset;
  if(master)assertMasterIdentity(purchase,purchase.beat.userId,master);
  if(purchase.licenseAsset)assertLicenceAsset(purchase,purchase.licenseAsset);
  const result: EmailAttachment[] = [];
  let remaining = 10 * 1024 * 1024;
  for (const asset of [purchase.licenseAsset, master]) {
    if (!asset || asset.deletedAt || Number(asset.byteSize) > remaining) continue;
    // Do not deliver a higher-tier format with a lower-tier purchase.
    if (asset === master) {
      if (!canDeliverBeatFile(purchase.licenseType,asset.mimeType)) continue;
    }
    try {
      const file = await localPrivateStorage.createAuthorizedRead({ assetId: asset.id, requesterUserId: userId, isAdmin: false });
      if(asset===master)await verifyRequestedBeatFile(file.bytes,file.mimeType,purchase.licenseType);
      if(asset===purchase.licenseAsset)await verifyAgreementBytes(file.bytes,purchase);
      if (file.bytes.length > remaining) continue;
      remaining -= file.bytes.length;
      result.push({ filename: file.fileName, content: file.bytes, contentType: file.mimeType });
    } catch(error) {throw error;}
  }
  for(const asset of await purchasedSampleAgreements(purchaseId,userId)){if(Number(asset.byteSize)>remaining)continue;try{const file=await readPurchasedSampleAgreement(purchaseId,userId,asset.id);if(file.bytes.length>remaining)continue;remaining-=file.bytes.length;result.push({filename:file.fileName,content:file.bytes,contentType:file.mimeType});}catch{console.warn("Sample agreement attachment unavailable",{purchaseId,assetId:asset.id});}}
  return result;
}

export async function purchaseAttachmentManifest(purchaseId:number,userId:number,attachments:EmailAttachment[]){
 const {purchase,asset,ready}=await purchaseDelivery(purchaseId,userId);if(!ready||!asset)throw Error('Requested file is not ready for delivery.');
 if(!attachments.some(file=>file.contentType?.startsWith("audio/")||file.contentType==="application/zip")){const stored=await localPrivateStorage.createAuthorizedRead({assetId:asset.id,requesterUserId:userId,isAdmin:false});await verifyRequestedBeatFile(stored.bytes,stored.mimeType,purchase.licenseType);}
 const files=attachments.map(file=>({name:file.filename,mime:file.contentType,checksum:createHash('sha256').update(file.content).digest('hex'),byteSize:file.content.length}));
 for(const file of files)if((file.mime?.startsWith('audio/')||file.mime==='application/zip')&&file.checksum!==asset.checksum)throw Error('Email audio does not match the verified purchase master.');
 if(purchase.licenseAsset){const pdf=attachments.find(file=>file.filename===purchase.licenseAsset!.safeFilename);if(pdf)await verifyAgreementBytes(pdf.content,purchase);}
 return {purchaseId,beatId:purchase.beatId,buyerId:userId,masterAssetId:asset.id,masterChecksum:asset.checksum,agreementAssetId:purchase.licenseAsset?.id||null,agreementIdentity:agreementIdentity(purchase),files};
}
