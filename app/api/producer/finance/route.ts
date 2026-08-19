import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { getProducerFinanceSummary, PRODUCER_COMMISSION_CONFIG } from "@/lib/producer-finance";

export async function GET() {
  const result = await requireRole(["producer", "admin"]);
  if ("error" in result) return result.error;
  return NextResponse.json({ ...(await getProducerFinanceSummary(result.user.id)), commission: PRODUCER_COMMISSION_CONFIG });
}
// vercel trigger 7
