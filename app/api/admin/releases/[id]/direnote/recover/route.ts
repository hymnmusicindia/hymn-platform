import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRecentAdminPermission } from "@/lib/access";
import { confirmDistributionNonReceipt } from "@/lib/distribution-recovery";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRecentAdminPermission("distribution.retry");
  if ("error" in admin) return admin.error;
  if (!("sub" in admin)) return NextResponse.json({ error: "Use a database-backed administrator account for recovery." }, { status: 403 });
  const parsed = z.object({ attemptId: z.number().int().positive(), evidence: z.string().trim().min(30).max(4000), providerReference: z.string().trim().min(5).max(200) }).safeParse(await request.json().catch(() => null));
  const releaseId = Number((await params).id);
  if (!parsed.success || !Number.isSafeInteger(releaseId) || releaseId < 1) return NextResponse.json({ error: "Supply a release, attempt, partner confirmation and support reference." }, { status: 400 });
  try {
    const attempt = await confirmDistributionNonReceipt({ ...parsed.data, releaseId, adminId: Number(admin.sub) });
    return NextResponse.json({ attemptId: attempt.id, state: attempt.state });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not reconcile this attempt." }, { status: 409 });
  }
}
