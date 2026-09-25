export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";

export async function PATCH() {
  const result = await requireAdminPermission("users.manage");
  if ("error" in result) return result.error;
  return NextResponse.json({ error: "Manage this profile through the linked producer account." }, { status: 410 });
}

export async function DELETE() {
  const result = await requireAdminPermission("users.manage");
  if ("error" in result) return result.error;
  return NextResponse.json({ error: "Revoke Producer access from the linked user account instead." }, { status: 410 });
}
// vercel trigger 9
