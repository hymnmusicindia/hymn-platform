import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { listAllDetailedReleases } from "@/lib/distribution-db";

export async function GET() {
  const result = await requireAdminPermission("releases.read");
  if ("error" in result) return result.error;
  const releases = await listAllDetailedReleases();
  return NextResponse.json({ releases });
}

// vercel trigger 9
