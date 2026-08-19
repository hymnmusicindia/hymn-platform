import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { generateBeatLicense } from "@/lib/beat-license";
export async function POST(request: Request) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const body = await request.json().catch(() => ({}));
  try { return NextResponse.json(await generateBeatLicense(Number(body.purchaseId), user.user.id, user.user.role === "admin"), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not generate license." }, { status: 400 }); }
}
