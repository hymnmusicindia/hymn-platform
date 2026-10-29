import {NextResponse} from 'next/server';
import {requireRole} from '@/lib/access';
import {prisma} from '@/lib/prisma';
import {localPrivateStorage} from '@/lib/private-storage';
import {createAdminTaskOnce} from '@/lib/task-queue';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const actor=await requireRole(['producer','admin']);if('error' in actor)return actor.error;
 const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:'Invalid beat.'},{status:400});
 const beat=await prisma.beat.findUnique({where:{id}});
 if(!beat||(actor.user.role!=='admin'&&beat.userId!==actor.user.id))return NextResponse.json({error:'Beat not found.'},{status:404});
 if(!['DRAFT','PENDING_REVIEW','CHANGES_REQUESTED','PUBLISHED'].includes(beat.status))return NextResponse.json({error:'This beat cannot be changed in its current state.'},{status:409});
 let assetId:number|null=null;
 try{
  const form=await request.formData(),file=form.get('sampleLicenseEvidence'),disclosure=String(form.get('sampleDisclosure')||'').trim();
  if(!(file instanceof File)||!file.size||file.size>10*1024*1024||file.type!=='application/pdf')throw Error('Upload the sample licence / certificate PDF (up to 10 MB).');
  if(disclosure.length<5||disclosure.length>2000)throw Error('Describe the provider, samples and licence permissions.');
  if(form.get('sampleRightsConfirmed')!=='on')throw Error('Confirm your rights and permission to provide the agreement to licensed buyers.');
  const bytes=Buffer.from(await file.arrayBuffer());if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Choose a genuine PDF file.');
  const stored=await localPrivateStorage.upload({ownerUserId:beat.userId,assetType:'private_ownership_proof',fileName:file.name,mimeType:'application/pdf',bytes});assetId=stored.id;
  await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM beats WHERE id = ${id} FOR UPDATE`;
   const current=await tx.beat.findUniqueOrThrow({where:{id}});if(current.updatedAt.getTime()!==beat.updatedAt.getTime())throw Error('The beat changed. Refresh and submit again.');
   await tx.storedAsset.update({where:{id:stored.id},data:{entityType:'BEAT',entityId:String(id),category:'BEAT_SAMPLE_LICENSE'}});
   await tx.beat.update({where:{id},data:{sampleDeclaration:'LICENSED_SAMPLES',sampleDeclaredAt:new Date(),sampleDisclosure:disclosure+`\nLicence evidence: ${stored.downloadPath}`,exclusivePriceCents:0,status:'PENDING_REVIEW',enabled:false,reviewIssues:{reason:'Review the supplied sample agreement and buyer permissions before publication.'}}});
   await tx.auditLog.create({data:{actorType:'user',actorId:actor.user.id,entity:'beat',entityId:String(id),action:'beat.sample_rights_declared',metadata:{sampleDeclaration:'LICENSED_SAMPLES',assetId:stored.id,buyerSharingConfirmed:true}}});
  });assetId=null;
  await createAdminTaskOnce({eventKey:`beat:${id}:sample-agreement:${stored.id}`,type:'Beat sample review',priority:'normal',title:`Sample agreement ready: ${beat.title}`,body:'Verify the certificate covers the samples, commercial beat licensing and buyer permissions. Exclusive licensing is disabled.',href:`/admin?tab=operations&beatId=${id}`,entityType:'beat',entityId:id}).catch(()=>console.error('Sample review task deferred',{beatId:id}));
  return NextResponse.json({success:true,status:'PENDING_REVIEW'});
 }catch(error){if(assetId)await localPrivateStorage.delete({assetId,requesterUserId:beat.userId,isAdmin:true}).catch(()=>undefined);return NextResponse.json({error:error instanceof Error?error.message:'Could not save sample agreement.'},{status:400});}
}
