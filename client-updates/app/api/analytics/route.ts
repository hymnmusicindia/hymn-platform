import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getAnalyticsSummary } from "@/lib/db";

export async function GET() {
  const result = await requireUser();
  if ("error" in result) return result.error;

  const summary = await getAnalyticsSummary(result.user);
  return NextResponse.json({ summary });
}


