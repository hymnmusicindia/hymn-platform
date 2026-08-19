import { NextResponse } from "next/server";
import { listBeats } from "@/lib/db";

export async function GET() {
  const beats = await listBeats();
  return NextResponse.json({ beats });
}

