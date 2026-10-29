import {createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {normalizeBeatLicenseType} from './beat-store';
type RecordValue=Record<string,unknown>;
const record=(value:unknown):RecordValue=>value&&typeof value==='object'&&!Array.isArray(value)?value as RecordValue:{};
function canonical(value:unknown):unknown{return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;}
export type DeliveryIdentity={id:number;userId:number;beatId:number;licenseType:string;licenseTermsSnapshot?:unknown};
export function agreementIdentity(identity:DeliveryIdentity){return `HYMN-BEAT-LICENCE-V1:${identity.id}:${identity.userId}:${identity.beatId}:${normalizeBeatLicenseType(identity.licenseType)}:${createHash('sha256').update(JSON.stringify(canonical(identity.licenseTermsSnapshot||{}))).digest('hex')}`;}
export function assertPurchaseIdentity(purchase:DeliveryIdentity){
 const snapshot=record(purchase.licenseTermsSnapshot),beat=record(snapshot.beat),buyer=record(snapshot.buyer);
 if((beat.id!=null&&beat.id!==purchase.beatId)||(buyer.id!=null&&buyer.id!==purchase.userId)||(snapshot.licenseType!=null&&normalizeBeatLicenseType(String(snapshot.licenseType))!==normalizeBeatLicenseType(purchase.licenseType)))throw Error('Purchase identity does not match the recorded agreement. Delivery requires review.');
}
export async function verifyAgreementBytes(bytes:Buffer,identity:DeliveryIdentity){assertPurchaseIdentity(identity);const pdf=await PDFDocument.load(bytes);if(pdf.getSubject()!==agreementIdentity(identity))throw Error('Agreement verification failed. Regenerate this purchase agreement before delivery.');}
export type MasterIdentity={id:number;beatId:number|null;ownerUserId:number;checksum:string;mimeType:string;byteSize:number;assetType:string;uploadStatus?:string;deletedAt?:Date|null;originalFilename?:string;entityType?:string|null;entityId?:string|null};
export function masterManifest(asset:MasterIdentity){return {assetId:asset.id,beatId:asset.beatId,ownerUserId:asset.ownerUserId,checksum:asset.checksum,mimeType:asset.mimeType,byteSize:asset.byteSize};}
export function assertMasterIdentity(purchase:DeliveryIdentity,producerId:number,asset:MasterIdentity){
 assertPurchaseIdentity(purchase);
 const linked=asset.beatId===purchase.beatId||(asset.beatId===null&&asset.entityType==='BEAT_PURCHASE'&&asset.entityId===String(purchase.id));
 if(asset.deletedAt||asset.uploadStatus&&asset.uploadStatus!=='ready'||asset.assetType!=='private_beat_deliverable'||!linked||asset.ownerUserId!==producerId)throw Error('The master does not belong to this beat and producer. Delivery requires review.');
 if(record(purchase.licenseTermsSnapshot).deliveryMaster===null)throw Error("The requested file is still awaiting producer delivery.");
 const frozen=record(record(purchase.licenseTermsSnapshot).deliveryMaster);
 if(Object.keys(frozen).length&&Object.entries(masterManifest(asset)).some(([key,value])=>frozen[key]!==value))throw Error('The master changed after purchase. An audited replacement is required before delivery.');
}
export function assertLicenceAsset(purchase:DeliveryIdentity,asset:{ownerUserId:number;beatPurchaseId:number|null;assetType:string;mimeType:string;deletedAt?:Date|null}){assertPurchaseIdentity(purchase);if(asset.deletedAt||asset.ownerUserId!==purchase.userId||asset.beatPurchaseId!==purchase.id||asset.assetType!=='private_beat_license'||asset.mimeType!=='application/pdf')throw Error('The agreement file does not belong to this purchase. Delivery requires review.');}
export function masterTitleMismatch(title:string,filename:string){
 const normalize=(value:string)=>value.toLowerCase().replace(/\.[a-z0-9]{2,5}$/i,'').replace(/[^\p{L}\p{N}]+/gu,'');
 const name=normalize(filename),expected=normalize(title);
 return Boolean(name&&expected&&!name.includes(expected)&&!expected.includes(name));
}
