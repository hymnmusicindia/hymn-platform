import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  const session = await prisma.uploadSession.findFirst({ where: { id: (await params).id, userId: auth.user.id }, include: { finalAsset: { select: { id: true, safeFilename: true } } } });
  if (!session) return NextResponse.json({ error: "Upload session not found." }, { status: 404 });
  return NextResponse.json({ session, downloadPath: session.finalAssetId ? `/api/assets/${session.finalAssetId}/download?filename=${encodeURIComponent(session.finalAsset?.safeFilename || session.originalFilename)}` : null }, { headers: { "Cache-Control": "no-store" } });
}
