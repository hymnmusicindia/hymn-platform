import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const admin = await requireAdminPermission("users.read");
  if ("error" in admin) return admin.error;
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const cursor = Number(url.searchParams.get("cursor"));
  const parties = await prisma.contributorParty.findMany({
    where: { ...(query ? { OR: [{ publicId: { contains: query, mode: "insensitive" } }, { professionalName: { contains: query, mode: "insensitive" } }] } : {}) },
    select: { id: true, publicId: true, professionalName: true, displayName: true, identityState: true, verifiedAt: true, createdAt: true, mergedInto: { select: { publicId: true } }, claimedBy: { select: { id: true, status: true } }, producerProfile: { select: { id: true, status: true, active: true } }, _count: { select: { contributions: true, beats: true, beatSales: true, splitRecipients: true } } },
    orderBy: { id: "desc" },
    ...(Number.isInteger(cursor) && cursor > 0 ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: 50
  });
  return NextResponse.json({ contributors: parties, nextCursor: parties.length === 50 ? parties.at(-1)?.id : null });
}
