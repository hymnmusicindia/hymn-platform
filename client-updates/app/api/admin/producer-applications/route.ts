import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { listProducerApplications } from "@/lib/db";

export async function GET() {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const applications = await listProducerApplications();
  return NextResponse.json({ applications });
}

