import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { listAllArtistProfiles } from "@/lib/db";

export async function GET() {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const profiles = await listAllArtistProfiles();
  return NextResponse.json({ profiles });
}

