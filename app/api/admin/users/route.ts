import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { listUsers } from "@/lib/db";

export async function GET() {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const users = await listUsers();
  return NextResponse.json({ users });
}



