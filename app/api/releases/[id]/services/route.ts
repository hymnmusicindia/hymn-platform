import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { isSameAppOrigin } from '@/lib/request-origin';
import { prisma } from '@/lib/prisma';
import { createDistributionService } from '@/lib/distribution-services';
import { z } from 'zod';
import { customerServiceRequest } from '@/lib/distribution-services-contract';
import { customerBrandText } from '@/lib/customer-message';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
export async function GET(_:Request,context:{params:Promise<{id:string}>}){
  const auth=await requireUser();if('error'in auth)return auth.error;
  const releaseId=Number((await context.params).id);
  if(!Number.isSafeInteger(releaseId)||releaseId<1||releaseId>2147483647)return NextResponse.json({error:'Release not found.'},{status:404,headers});
  if(!await prisma.release.count({where:{id:releaseId,userId:auth.user.id,archivedAt:null,user:{status:'ACTIVE'}}}))return NextResponse.json({error:'Release not found.'},{status:404,headers});
  const requests=await prisma.releaseChangeRequest.findMany({where:{releaseId,requestType:'distribution_service'},orderBy:{id:'desc'},take:100,select:{id:true,status:true,reason:true,requestedChanges:true,submittedAt:true,adminNote:true,events:{orderBy:{id:'asc'},select:{id:true,note:true,newStatus:true,createdAt:true}}}});
  return NextResponse.json({requests:requests.map(row=>({...customerServiceRequest(row),adminNote:row.adminNote?customerBrandText(row.adminNote):null,events:row.events.map(event=>({...event,note:customerBrandText(event.note)}))}))},{headers});
}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  if(!isSameAppOrigin(request))return NextResponse.json({error:'Same-origin request required.'},{status:403,headers});
  const auth=await requireUser();if('error'in auth)return auth.error;
  try{return NextResponse.json({request:customerServiceRequest(await createDistributionService(Number((await context.params).id),auth.user.id,await request.json()))},{status:201,headers});}
  catch(error){const message=error instanceof z.ZodError?error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; '):error instanceof Error && !error.name.startsWith('Prisma')?customerBrandText(error.message):'Release not found or request could not be saved. Refresh before trying again.';return NextResponse.json({error:message},{status:400,headers});}
}
