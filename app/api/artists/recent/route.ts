import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { listRecentArtistProfilesByUser } from "@/lib/db";

export async function GET() {
  const result = await requireUser();
  if ("error" in result) return result.error;

  const profiles = await listRecentArtistProfilesByUser(result.user.id);
  return NextResponse.json({ profiles });
}

