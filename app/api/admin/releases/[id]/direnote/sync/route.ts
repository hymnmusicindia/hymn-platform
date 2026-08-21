import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { syncDireNoteRelease } from "@/lib/direnote-service";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("releases.read");
  if ("error" in admin) return admin.error;
  const releaseId = Number((await params).id);
  if (!Number.isInteger(releaseId) || releaseId < 1) return NextResponse.json({ error: "Valid release id is required." }, { status: 400 });
  try { return NextResponse.json(await syncDireNoteRelease(releaseId, "sub" in admin ? Number(admin.sub) : null)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "DireNote sync failed." }, { status: 502 }); }
}
