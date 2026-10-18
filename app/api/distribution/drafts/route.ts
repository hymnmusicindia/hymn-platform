import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getFirstReleaseEligibility, FIRST_RELEASE_PROMOTION_CODE } from "@/lib/first-release-promotion";
import { firstReleaseAttribution } from "@/lib/first-release-flow";
import { meaningfulDraftTitle } from "@/lib/draft-policy";
export async function POST(request: Request) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const body = await request.json().catch(() => ({}));
  const title = meaningfulDraftTitle(body.title);
  if (!title) return NextResponse.json({ error: "Enter an album or track title before saving a draft." }, { status: 400 });
  const wizardFormatIntent = body.wizardFormatIntent === "single" || body.wizardFormatIntent === "ep" || body.wizardFormatIntent === "album" ? body.wizardFormatIntent : null;
  const free = body.promotionCode === FIRST_RELEASE_PROMOTION_CODE && (await getFirstReleaseEligibility(user.user.id)).eligible;
  if (body.promotionCode === FIRST_RELEASE_PROMOTION_CODE && !free) return NextResponse.json({ error: "The first-release offer is not currently available for this account. Refresh to check your eligibility." }, { status: 409 });
  if (free && wizardFormatIntent && wizardFormatIntent !== "single") return NextResponse.json({ error: "The first-release offer covers one Single." }, { status: 400 });
  const missingFields = ["Artwork", "Audio", "Metadata", "Credits", "Legal Confirmation"];
  const release = await prisma.release.create({ data: { userId: user.user.id, title, artistName: user.user.name, genre: "", releaseDate: new Date(), status: "DRAFT", releaseType: "single", paymentStatus: "pending", draftCompletionPercent: 0, lastEditedAt: new Date(), missingFields, metadata: { draftCompletionPercent: 0, missingFields, lastEditedAt: new Date().toISOString(), ...(wizardFormatIntent ? { wizardFormatIntent } : {}), ...(free ? { promotionCode: FIRST_RELEASE_PROMOTION_CODE, campaignAttribution: firstReleaseAttribution(body.attribution ?? {}) } : {}) } }, select: { id: true, updatedAt: true } });
  return NextResponse.json({ draft: release }, { status: 201 });
}
