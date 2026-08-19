import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { duplicateReleaseForUser } from "@/lib/distribution-db";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  try {
    const duplicate = await duplicateReleaseForUser(auth.user.id, id);
    if (!duplicate) return NextResponse.json({ error: "Release not found." }, { status: 404 });
    return NextResponse.json({ releaseId: duplicate.id }, { status: 201 });
  } catch (error) {
    console.error("Release duplication failed", { releaseId: id, userId: auth.user.id, error });
    return NextResponse.json({ error: "Could not duplicate this release. Please try again." }, { status: 500 });
  }
}
// vercel trigger 7
