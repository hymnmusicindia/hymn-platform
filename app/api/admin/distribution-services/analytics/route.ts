import { NextResponse } from 'next/server';
import { requireAdminPermission } from '@/lib/access';
import { isSameAppOrigin } from '@/lib/request-origin';
import { readAdminDistributionAnalytics } from '@/lib/distribution-insights';
export async function POST(request:Request){
  if(!isSameAppOrigin(request))return NextResponse.json({error:'Same-origin required.'},{status:403});
  const auth=await requireAdminPermission('royalties.reconcile');if('error'in auth)return auth.error;
  const input=await request.json().catch(()=>null);
  try{return NextResponse.json(await readAdminDistributionAnalytics(input?.query,input?.scope),{headers:{'Cache-Control':'private, no-store'}});}
  catch{return NextResponse.json({error:'Reporting is unavailable. Check period, currency and any identifier required for the selected summary.'},{status:400});}
}
