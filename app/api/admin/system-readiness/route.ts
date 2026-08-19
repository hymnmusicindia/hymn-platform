import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { getProductionReadinessIssues } from "@/lib/env";

export async function GET() {
  const admin = await requireAdminPermission("system.manage");
  if ("error" in admin) return admin.error;
  const issues = getProductionReadinessIssues();
  return NextResponse.json({ success: issues.length === 0, data: { ready: issues.length === 0, issues } }, { status: issues.length === 0 ? 200 : 503 });
}
// vercel trigger 5
// vercel trigger 9
