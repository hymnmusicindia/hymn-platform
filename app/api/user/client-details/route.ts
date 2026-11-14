import {z} from 'zod';
import {getSession} from '@/lib/session';
import {prisma} from '@/lib/prisma';
import {isSameAppOrigin} from '@/lib/request-origin';
import {referralJson} from '@/lib/referral-request';
import {clientDetailsSchema} from '@/lib/client-details';
import {customerDetailsSnapshot,saveCustomerDetails} from '@/lib/client-details-service';
import {TeamError} from '@/lib/team/policy';
const headers={'Cache-Control':'private, no-store'};
export async function GET(){const session=await getSession();if(!session)return Response.json({error:'Unauthorized.'},{status:401,headers});const user=await prisma.user.findUnique({where:{id:session.sub},select:{onboardingPreferences:true,status:true}});if(!user||user.status!=='ACTIVE')return Response.json({error:'Account unavailable.'},{status:403,headers});return Response.json(customerDetailsSnapshot(user.onboardingPreferences),{headers});}
export async function PATCH(request:Request){
 const session=await getSession();if(!session)return Response.json({error:'Unauthorized.'},{status:401,headers});
 if(!isSameAppOrigin(request))return Response.json({error:'Same-origin request required.'},{status:403,headers});
 const parsed=z.object({details:clientDetailsSchema,revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1)}).strict().safeParse(await referralJson(request,3000));
 if(!parsed.success)return Response.json({error:'Check the optional profile fields and try again.'},{status:400,headers});
 try{return Response.json(await saveCustomerDetails(session.sub,parsed.data.details,parsed.data.revision),{headers});}catch(e){return Response.json({error:e instanceof TeamError?e.message:'Could not save project details. Please retry.'},{status:e instanceof TeamError?e.status:500,headers});}
}
