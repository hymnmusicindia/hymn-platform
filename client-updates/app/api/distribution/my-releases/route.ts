import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listDetailedReleasesByUser } from "@/lib/distribution-db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const releases = await listDetailedReleasesByUser(session.sub);
  return NextResponse.json({ releases });
}

