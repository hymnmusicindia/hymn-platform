import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { listAllDetailedReleases } from "@/lib/distribution-db";

export async function GET() {
  const result = await requireAdmin();
  if ("error" in result) return result.error;
  const releases = await listAllDetailedReleases();
  return NextResponse.json({ releases });
}

