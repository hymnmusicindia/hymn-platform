import 'server-only';
import {prisma} from './prisma';
import {localPrivateStorage} from './private-storage';
export async function purchasedSampleAgreements(purchaseId:number,userId:number){
 const purchase=await prisma.beatPurchase.findFirst({where:{id:purchaseId,userId,hasAccess:true,user:{status:'ACTIVE'}},select:{beatId:true,licenseTermsSnapshot:true,beat:{select:{userId:true}}}});
 if(!purchase)return [];
 const snapshot=purchase.licenseTermsSnapshot as {sampleEvidenceIds?:unknown}|null;
 const ids=Array.isArray(snapshot?.sampleEvidenceIds)?snapshot.sampleEvidenceIds.filter((id):id is number=>Number.isSafeInteger(id)&&Number(id)>0):[];
 if(!ids.length)return [];
 return prisma.storedAsset.findMany({where:{id:{in:ids},ownerUserId:purchase.beat.userId,entityType:'BEAT',entityId:String(purchase.beatId),category:'BEAT_SAMPLE_LICENSE',assetType:'private_ownership_proof',deletedAt:null,mimeType:'application/pdf'},select:{id:true,safeFilename:true,byteSize:true},orderBy:{id:'asc'}});
}
export async function readPurchasedSampleAgreement(purchaseId:number,userId:number,assetId:number){
 const assets=await purchasedSampleAgreements(purchaseId,userId);
 if(!assets.some(asset=>asset.id===assetId))throw Error('Sample agreement not found.');
 // Only after matching an active purchase, its immutable evidence IDs and the producer.
 return localPrivateStorage.createAuthorizedRead({assetId,requesterUserId:userId,isAdmin:true});
}
