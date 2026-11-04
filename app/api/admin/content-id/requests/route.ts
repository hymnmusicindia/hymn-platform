import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminPermission("releases.review");
  if ("error" in admin) return admin.error;

  const requests = await prisma.contentIdAccess.findMany({
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    include: {
      user: { select: { id: true, name: true, email: true } },
      release: {
        select: {
          id: true,
          title: true,
          artistName: true,
          artworkUrl: true,
          releaseType: true,
          metadata: true,
          tracks: { orderBy: { trackNumber: "asc" }, select: { id: true, title: true, trackNumber: true } }
        }
      },
      distributionOrder: {
        select: { id: true, amount: true, creditsUsed: true, paymentStatus: true, razorpayPaymentId: true, createdAt: true }
      },
      reviewedBy: { select: { id: true, name: true, email: true } }
    }
  });

  return NextResponse.json({ requests }, { headers: { "Cache-Control": "private, no-store" } });
}
