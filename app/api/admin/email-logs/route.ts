import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getEmailConfig } from "@/lib/email/email-client";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if ("error" in admin) return admin.error;
  const query = new URL(request.url).searchParams;
  const status = query.get("status")?.trim();
  const template = query.get("template")?.trim();
  const userId = Number(query.get("userId"));
  const logs = await (prisma as any).emailLog.findMany({ where: { ...(status ? { status } : {}), ...(template ? { template } : {}), ...(Number.isInteger(userId) && userId > 0 ? { userId } : {}) }, orderBy: { createdAt: "desc" }, take: Math.min(Number(query.get("limit")) || 100, 250) });
  return NextResponse.json({ logs, configured: getEmailConfig().enabled });
}
// vercel trigger 6
