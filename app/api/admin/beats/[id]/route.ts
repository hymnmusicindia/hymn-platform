import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { updateBeat } from "@/lib/db";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdminPermission("users.manage");
  if ("error" in result) return result.error;

  const { id } = await params;

  try {
    const payload = (await request.json()) as { enabled?: boolean };
    if (typeof payload.enabled !== "boolean") {
      return NextResponse.json({ error: "Missing enabled flag." }, { status: 400 });
    }

    const beat = await updateBeat(Number(id), { enabled: payload.enabled });
    if (!beat) return NextResponse.json({ error: "Beat not found." }, { status: 404 });
    return NextResponse.json({ beat });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update beat.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
// vercel trigger 9
