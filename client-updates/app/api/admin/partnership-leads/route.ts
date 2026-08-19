import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { listPartnershipLeads } from "@/lib/db";

export async function GET() {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const leads = await listPartnershipLeads();
  return NextResponse.json({ leads });
}

