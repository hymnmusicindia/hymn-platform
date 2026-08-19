import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getPublicPayoutConfig } from "@/lib/payout/exchange-rates";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if ("error" in user) return user.error;
  return NextResponse.json(await getPublicPayoutConfig(), { headers: { "Cache-Control": "private, no-store" } });
}


// vercel trigger 12
