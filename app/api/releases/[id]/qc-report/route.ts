import { customerQcReport } from "@/lib/customer-qc-report";
import { NextResponse } from 'next/server';
import { releaseQcAccess } from '@/lib/release-qc-access';
import { readReleaseQcReport } from '@/lib/direnote-qc-store';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const access=await releaseQcAccess(Number((await params).id));if('error' in access)return access.error;
  const report=customerQcReport(await readReleaseQcReport(access.release.id));
  const download=new URL(request.url).searchParams.get('download')==='1';
  return NextResponse.json({release:{id:access.release.id,title:access.release.title,upc:access.release.upc,status:access.release.status},report},{headers:{'Cache-Control':'private, no-store',Vary:'Cookie',...(download?{'Content-Disposition':`attachment; filename="hymn-qc-${access.release.id}.json"`}:{})}});
}
