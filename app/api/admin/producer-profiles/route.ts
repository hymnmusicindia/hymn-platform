export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { listProducerProfiles } from "@/lib/db";

export async function GET() {
  const result = await requireAdminPermission("users.read");
  if ("error" in result) return result.error;

  const producerProfiles = await listProducerProfiles();
  return NextResponse.json({ producerProfiles });
}

export async function POST() {
  const result = await requireAdminPermission("users.manage");
  if ("error" in result) return result.error;
  return NextResponse.json({ error: "Create producers by assigning Producer access to an existing user account." }, { status: 410 });
}

// vercel trigger 9
