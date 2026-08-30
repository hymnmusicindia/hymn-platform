import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { submitRelease } from "@/lib/distribution-service";
import { getPublicAppUrl } from "@/lib/public-app-url";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("distribution.submit"); if ("error" in admin) return admin.error;
  const result = await submitRelease(Number((await params).id), { actorId: "sub" in admin ? admin.sub : null, siteUrl: getPublicAppUrl(request.url) });
  return NextResponse.json(result, { status: result.submitted ? 200 : result.validation.ok ? 502 : 400 });
}
// vercel trigger 9
