import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
export async function POST(request: Request) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const body = await request.json().catch(() => ({}));
  const missingFields = ["Artwork", "Audio", "Metadata", "Credits", "Legal Confirmation"];
  const release = await prisma.release.create({ data: { userId: user.user.id, title: String(body.title || "Untitled release"), artistName: user.user.name, genre: "", releaseDate: new Date(), status: "DRAFT", releaseType: "single", paymentStatus: "pending", draftCompletionPercent: 0, lastEditedAt: new Date(), missingFields, metadata: { draftCompletionPercent: 0, missingFields, lastEditedAt: new Date().toISOString() } }, select: { id: true } });
  return NextResponse.json({ draft: release }, { status: 201 });
}
