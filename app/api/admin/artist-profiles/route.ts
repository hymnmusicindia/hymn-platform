import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { listAllArtistProfiles } from "@/lib/db";

export async function GET() {
  const result = await requireAdminPermission("users.read");
  if ("error" in result) return result.error;

  const profiles = await listAllArtistProfiles();
  return NextResponse.json({ profiles });
}

// vercel trigger 9
