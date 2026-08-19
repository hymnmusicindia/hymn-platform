import { NextResponse } from "next/server";
import { clearAdminSession, clearSession } from "@/lib/session";

export async function POST() {
  await clearSession();
  await clearAdminSession();
  return NextResponse.json({ ok: true });
}
