import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { submitRelease } from "@/lib/distribution-service";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(); if ("error" in admin) return admin.error;
  const result = await submitRelease(Number((await params).id), { actorId: "sub" in admin ? admin.sub : null, siteUrl: new URL(request.url).origin });
  return NextResponse.json(result, { status: result.submitted ? 200 : result.validation.ok ? 502 : 400 });
}
