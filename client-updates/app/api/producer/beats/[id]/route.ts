import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { listAllBeats, updateBeat } from "@/lib/db";
import { beatMutationSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireRole(["producer", "admin"]);
  if ("error" in result) return result.error;

  const { id } = await params;
  const beatId = Number(id);
  const beat = (await listAllBeats()).find((item) => item.id === beatId);
  if (!beat) return NextResponse.json({ error: "Beat not found." }, { status: 404 });
  if (result.user.role === "producer" && beat.producerId !== result.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const payload = beatMutationSchema.parse(await request.json());
    const updated = await updateBeat(beatId, payload);
    return NextResponse.json({ beat: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update beat.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

