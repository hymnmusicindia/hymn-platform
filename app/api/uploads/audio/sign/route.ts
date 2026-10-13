import { NextResponse } from "next/server";
// Retired provider handshake: stale clients must reload to use managed uploads.
export async function POST() {
  return NextResponse.json({ error: "This upload method has been replaced. Refresh the page and select your file again." }, { status: 410 });
}
