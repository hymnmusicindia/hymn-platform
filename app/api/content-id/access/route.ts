import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { normalizeContentIdAccessStatus } from "@/lib/content-id-access";
import { contentIdLiveTrackCountsQuery, contentIdReviewReadiness, type ContentIdLiveTrackCount } from "@/lib/content-id-review-eligibility";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requireUser();
  if ("error" in result) return result.error;

  const access = await prisma.contentIdAccess.findUnique({
    where: { userId: result.user.id },
    include: {
      release: {
        select: {
          id: true,
          title: true,
          artistName: true,
          artworkUrl: true,
          tracks: { orderBy: { trackNumber: "asc" }, select: { id: true, title: true, trackNumber: true } }
        }
      },
      distributionOrder: {
        select: { paymentStatus: true, amount: true, creditsUsed: true, createdAt: true }
      }
    }
  });
  const countQuery = contentIdLiveTrackCountsQuery([result.user.id]);
  const liveTrackCounts = countQuery ? await prisma.$queryRaw<ContentIdLiveTrackCount[]>(countQuery) : [];
  const reviewReadiness = contentIdReviewReadiness(liveTrackCounts[0]?.liveTrackCount ?? 0);

  return NextResponse.json({
    access: access ? {
      status: normalizeContentIdAccessStatus(access.status),
      requestedAt: access.requestedAt,
      reviewedAt: access.reviewedAt,
      reviewReason: access.status === "declined" ? access.reviewReason : null,
      channelUrl: access.channelUrl,
      feeAmount: access.feeAmount,
      release: access.release,
      payment: access.distributionOrder,
      reviewEligibility: reviewReadiness
    } : { status: "none" }
  }, { headers: { "Cache-Control": "private, no-store" } });
}
