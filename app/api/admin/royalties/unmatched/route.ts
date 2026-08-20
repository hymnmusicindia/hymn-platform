import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const admin = await requireAdminPermission("royalties.reconcile"); if ("error" in admin) return admin.error;
  const status = new URL(request.url).searchParams.get("status") || "unmatched";
  return NextResponse.json({ rows: await prisma.unmatchedRoyaltyRow.findMany({ where: { status }, include: { statement: { select: { provider: true, currency: true, periodStart: true, periodEnd: true } }, matchedRelease: { select: { title: true, artistName: true } }, matchedTrack: { select: { title: true } } }, orderBy: { createdAt: "asc" }, take: 250 }) });
}
// vercel trigger 9
