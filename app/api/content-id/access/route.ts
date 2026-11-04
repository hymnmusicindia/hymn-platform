import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { normalizeContentIdAccessStatus } from "@/lib/content-id-access";

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

  return NextResponse.json({
    access: access ? {
      status: normalizeContentIdAccessStatus(access.status),
      requestedAt: access.requestedAt,
      reviewedAt: access.reviewedAt,
      reviewReason: access.status === "declined" ? access.reviewReason : null,
      channelUrl: access.channelUrl,
      feeAmount: access.feeAmount,
      release: access.release,
      payment: access.distributionOrder
    } : { status: "none" }
  }, { headers: { "Cache-Control": "private, no-store" } });
}
