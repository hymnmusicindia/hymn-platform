import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getPayoutSummary } from "@/lib/payout";

export const runtime = "nodejs";

export async function GET() {
  const result = await requireUser();
  if ("error" in result) return result.error;

  const summary = await getPayoutSummary(result.user.id);
  return NextResponse.json(summary);
}

// vercel trigger 2
