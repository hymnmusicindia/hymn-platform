import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getOrCreateSplitRecord, listUserSplits } from "@/lib/splits";

export const runtime = "nodejs";
export async function GET() { const auth = await requireUser(); if ("error" in auth) return auth.error; return NextResponse.json(await listUserSplits(auth.user.id)); }
export async function POST(request: Request) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  try { return NextResponse.json({ split: await getOrCreateSplitRecord(auth.user.id, Number(body.releaseId), body.trackId ? Number(body.trackId) : null) }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create split." }, { status: 400 }); }
}
