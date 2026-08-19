import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { reviewPayoutCredential } from "@/lib/payout/credentials";

const schema = z.object({ status: z.enum(["under_review", "changes_requested", "verified", "rejected", "suspended"]), note: z.string().trim().min(3).max(2000) });
export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const admin = await requireAdminPermission("kyc.review"); if ("error" in admin) return admin.error;
  try {
    const userId = Number((await context.params).userId); const body = schema.parse(await request.json());
    const actorId = "sub" in admin ? Number(admin.sub) || null : null;
    const { profile, releasedEarnings } = await reviewPayoutCredential(userId, { ...body, actorId });
    return NextResponse.json({ profile: { userId, status: profile.status, legalName: profile.legalName, country: profile.country, panLastFour: profile.panLastFour, account: profile.bankAccountMasked ?? profile.upiIdMasked, note: profile.verificationNote }, releasedEarnings });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Verification failed." }, { status: 400 }); }
}
// vercel trigger 9
