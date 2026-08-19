import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { getDetailedReleaseById } from "@/lib/distribution-db";
import { validateReleaseForDireNote } from "@/lib/direnote-readiness";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(); if ("error" in admin) return admin.error;
  const release = await getDetailedReleaseById(Number((await params).id));
  if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  const result = await validateReleaseForDireNote(release, { siteUrl: new URL(request.url).origin });
  return NextResponse.json({ ready: result.ready, issues: result.issues, warnings: result.warnings });
}
