import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getFirstReleaseEligibility, FIRST_RELEASE_PROMOTION_CODE } from "@/lib/first-release-promotion";
import { firstReleaseAttribution } from "@/lib/first-release-flow";
export async function POST(request: Request) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const body = await request.json().catch(() => ({}));
  const free = body.promotionCode === FIRST_RELEASE_PROMOTION_CODE && (await getFirstReleaseEligibility(user.user.id)).eligible;
  if (body.promotionCode === FIRST_RELEASE_PROMOTION_CODE && !free) return NextResponse.json({ error: "The first-release offer is not currently available for this account. Refresh to check your eligibility." }, { status: 409 });
  const missingFields = ["Artwork", "Audio", "Metadata", "Credits", "Legal Confirmation"];
  const release = await prisma.release.create({ data: { userId: user.user.id, title: String(body.title || "Untitled release"), artistName: user.user.name, genre: "", releaseDate: new Date(), status: "DRAFT", releaseType: "single", paymentStatus: "pending", draftCompletionPercent: 0, lastEditedAt: new Date(), missingFields, metadata: { draftCompletionPercent: 0, missingFields, lastEditedAt: new Date().toISOString(), ...(free ? { promotionCode: FIRST_RELEASE_PROMOTION_CODE, campaignAttribution: firstReleaseAttribution(body.attribution ?? {}) } : {}) } }, select: { id: true } });
  return NextResponse.json({ draft: release }, { status: 201 });
}
