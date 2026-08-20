import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { createPayoutRequest } from "@/lib/payout";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;

  const body = await request.json().catch(() => ({}));

  try {
    const payoutRequest = await createPayoutRequest(result.user.id, {
      amount: Number(body.amount),
      method: body.method === "BANK" ? "BANK" : "UPI",
      upiId: typeof body.upiId === "string" ? body.upiId : undefined,
      accountHolderName: typeof body.accountHolderName === "string" ? body.accountHolderName : undefined,
      bankAccountNumber: typeof body.bankAccountNumber === "string" ? body.bankAccountNumber : undefined,
      ifsc: typeof body.ifsc === "string" ? body.ifsc : undefined,
      userNote: typeof body.userNote === "string" ? body.userNote : undefined
      ,sourceType: result.user.role === "producer" ? "producer_beat_sales" : "artist_royalty"
    });

    return NextResponse.json({ request: payoutRequest }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not submit payout request." }, { status: 400 });
  }
}

// vercel trigger 2
// vercel trigger 7
