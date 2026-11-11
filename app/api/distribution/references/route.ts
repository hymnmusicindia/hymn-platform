import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { z } from 'zod';
import { customerReferenceActions } from '@/lib/distribution-services-contract';
import { readCustomerReference } from '@/lib/distribution-insights';
const schema=z.object({action:z.enum(customerReferenceActions),search:z.string().trim().max(100).default('')});
export async function GET(request:Request){
  const auth=await requireUser();if('error'in auth)return auth.error;
  if(auth.user.status!=='active')return NextResponse.json({error:'Account inactive.'},{status:403});
  const parsed=schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!parsed.success)return NextResponse.json({error:'Choose an available reference.'},{status:400});
  try{return NextResponse.json(await readCustomerReference(parsed.data.action,parsed.data.search),{headers:{'Cache-Control':'private, no-store'}});}
  catch{return NextResponse.json({error:'Reference values are temporarily unavailable.'},{status:503});}
}
