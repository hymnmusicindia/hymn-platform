import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { deleteDraftReleaseForUser } from "@/lib/distribution-db";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  try {
    const result = await deleteDraftReleaseForUser(auth.user.id, id);
    if (result === "not_found") return NextResponse.json({ error: "Release not found." }, { status: 404 });
    if (result === "blocked") return NextResponse.json({ error: "This release cannot be deleted after submission." }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Draft deletion failed", { releaseId: id, userId: auth.user.id, error });
    return NextResponse.json({ error: "Could not delete this draft. Please try again." }, { status: 500 });
  }
}
// vercel trigger 7
