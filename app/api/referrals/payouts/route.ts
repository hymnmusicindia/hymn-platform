import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { requestReferralPayout } from "@/lib/referral-commissions";
import { Prisma } from "@prisma/client";
export async function POST() {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  try { return NextResponse.json({ payout: await requestReferralPayout(auth.user.id) }, { status: 201 }); }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return NextResponse.json({ error: "Your balance changed. Refresh and try again." }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not request payout." }, { status: 400 });
  }
}
