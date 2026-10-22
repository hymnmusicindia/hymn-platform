import { NextResponse } from "next/server";
import { getAdminAccessForPage } from "@/lib/access";
import { listAllDetailedReleases } from "@/lib/distribution-db";

export async function GET() {
  const result = await getAdminAccessForPage();
  if (!result?.permissions.some(permission => ["releases.read", "releases.review", "distribution.retry", "distribution.submit"].includes(permission))) return NextResponse.json({error:"Forbidden."},{status:403});
  const releases = await listAllDetailedReleases();
  return NextResponse.json({ releases }, {headers:{"Cache-Control":"private, no-store"}});
}

// vercel trigger 9
