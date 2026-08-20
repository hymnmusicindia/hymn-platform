import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { listArtistProfilesByUser } from "@/lib/db";

export async function GET(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const profiles = await listArtistProfilesByUser(result.user.id, q);
  return NextResponse.json({ profiles });
}

