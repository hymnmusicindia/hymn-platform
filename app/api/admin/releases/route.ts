import { NextResponse } from "next/server";
import { getAdminAccessForPage } from "@/lib/access";
import { listAllDetailedReleases } from "@/lib/distribution-db";
import { adminReleaseDelta } from "@/lib/admin-release-delta";

export async function GET(request: Request) {
  const result = await getAdminAccessForPage();
  if (!result?.permissions.some(permission => ["releases.read", "releases.review", "distribution.retry", "distribution.submit"].includes(permission))) return NextResponse.json({error:"Forbidden."},{status:403});
  const params=request?new URL(request.url).searchParams:null;
  const since=params?.get('since'),until=params?.get('until');
  const watermark=new Date();
  if(since) {
    const from=new Date(since),to=until?new Date(until):watermark,afterId=Number(params?.get('afterId')||0);
    if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||to>watermark||from>to||!Number.isSafeInteger(afterId)||afterId<0)return NextResponse.json({error:'Invalid update cursor.'},{status:400});
    return NextResponse.json(await adminReleaseDelta({since:from,until:to,afterId}),{headers:{'Cache-Control':'private, no-store'}});
  }
  const releases = await listAllDetailedReleases();
  return NextResponse.json({ releases, watermark:watermark.toISOString() }, {headers:{"Cache-Control":"private, no-store"}});
}

// vercel trigger 9
