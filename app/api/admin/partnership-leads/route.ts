import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { listPartnershipLeads } from "@/lib/db";

export async function GET() {
  const result = await requireAdminPermission("users.read");
  if ("error" in result) return result.error;

  const leads = await listPartnershipLeads();
  return NextResponse.json({ leads });
}

// vercel trigger 9
