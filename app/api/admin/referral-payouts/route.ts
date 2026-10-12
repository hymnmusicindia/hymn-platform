import { NextResponse } from "next/server";
import { requireRecentAdminPermission } from "@/lib/access";
import { reviewReferralPayout } from "@/lib/referral-commissions";
import { z } from "zod";
import { Prisma } from "@prisma/client";
export async function POST(request: Request) {
  const admin = await requireRecentAdminPermission("payouts.review"); if ("error" in admin) return admin.error;
  try {
    const body = z.object({ id: z.number().int().positive(), action: z.enum(["paid", "reject"]), note: z.string().trim().min(5).max(1000), reference: z.string().trim().min(5).max(200).optional() }).parse(await request.json());
    return NextResponse.json(await reviewReferralPayout(body.id, "sub" in admin ? Number(admin.sub) : null, body));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return NextResponse.json({ error: "The payout changed or its payment reference is already recorded. Refresh and review again." }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not review payout." }, { status: 400 });
  }
}
