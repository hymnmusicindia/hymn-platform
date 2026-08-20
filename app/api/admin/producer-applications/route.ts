import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { listProducerApplications } from "@/lib/db";

export async function GET() {
  const result = await requireAdminPermission("users.read");
  if ("error" in result) return result.error;

  const applications = await listProducerApplications();
  return NextResponse.json({ applications });
}

// vercel trigger 9
