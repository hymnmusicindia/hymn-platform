import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { listUsers } from "@/lib/db";

export async function GET() {
  const result = await requireAdminPermission("users.read");
  if ("error" in result) return result.error;

  const users = await listUsers();
  return NextResponse.json({ users });
}



// vercel trigger 9
