import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { previewSplitCode } from "@/lib/splits";

export const runtime = "nodejs";
const attempts = new Map<number, { count: number; resetAt: number }>();
export async function POST(request: Request) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  const current = attempts.get(auth.user.id); const now = Date.now();
  if (current && current.resetAt > now && current.count >= 10) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  attempts.set(auth.user.id, current && current.resetAt > now ? { ...current, count: current.count + 1 } : { count: 1, resetAt: now + 15 * 60_000 });
  const body = await request.json().catch(() => ({}));
  try { return NextResponse.json({ preview: await previewSplitCode(auth.user.id, String(body.code || "")) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not validate code." }, { status: 400 }); }
}
