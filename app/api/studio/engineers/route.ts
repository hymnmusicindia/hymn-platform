import { NextResponse } from "next/server";
import { listStudioEngineers } from "@/lib/studio-services";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const number = (key: string) => { const value = Number(query.get(key)); return Number.isFinite(value) && value > 0 ? value : undefined; };
  const engineers = await listStudioEngineers({ genre: query.get("genre")?.trim() || undefined, maxPrice: number("maxPrice"), maxTurnaround: number("maxTurnaround") });
  return NextResponse.json({ engineers });
}
