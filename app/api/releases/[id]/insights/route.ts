import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/access';
import { isSameAppOrigin } from '@/lib/request-origin';
import { readDistributionAnalytics,readCustomerSmartLink } from '@/lib/distribution-insights';
const input=z.object({kind:z.enum(['analytics','smartlink']),query:z.unknown().optional()}).strict();
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  if(!isSameAppOrigin(request))return NextResponse.json({error:'Same-origin request required.'},{status:403,headers});
  const auth=await requireUser();if('error'in auth)return auth.error;
  const parsed=input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid reporting query.'},{status:400,headers});
  try{const id=Number((await context.params).id);return NextResponse.json(parsed.data.kind==='smartlink'?await readCustomerSmartLink(id,auth.user.id):await readDistributionAnalytics(id,auth.user.id,parsed.data.query),{headers});}
  catch{return NextResponse.json({error:'HYMN could not retrieve verified release data. Check the reporting period and release identifiers, or try again later.'},{status:400,headers});}
}
