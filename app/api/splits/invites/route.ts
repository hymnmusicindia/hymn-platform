import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { createSplitInvite } from "@/lib/splits";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  try { const invite = await createSplitInvite(auth.user.id, { splitRecordId: Number(body.splitRecordId), method: body.method === "split_code" ? "split_code" : "registered_email", recipientEmail: typeof body.recipientEmail === "string" ? body.recipientEmail : undefined, recipientName: typeof body.recipientName === "string" ? body.recipientName : undefined, role: String(body.role || ""), sharePercent: Number(body.sharePercent), payoutEligible: body.payoutEligible !== false, note: typeof body.note === "string" ? body.note : undefined }); return NextResponse.json({ invite }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create invite." }, { status: 400 }); }
}
