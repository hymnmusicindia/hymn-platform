import { NextResponse } from "next/server";
import { buildCheckoutQuote } from "@/lib/checkout";
import { getSession } from "@/lib/session";
import { checkoutQuoteSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const payload = checkoutQuoteSchema.parse(await request.json());
    const quote = await buildCheckoutQuote(session.sub, { ...payload, useReferralCredits: true });
    return NextResponse.json({
      referralCreditsApplied: quote.referralCreditsApplied,
      referralCreditBalance: quote.referralCreditBalance,
      quote
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Referral credits could not be applied.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
