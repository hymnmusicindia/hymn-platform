import { NextResponse } from "next/server";
import { getDistributionQueueSummary } from "@/lib/distribution-db";

export async function GET() {
  const summary = await getDistributionQueueSummary();
  return NextResponse.json({ summary });
}
