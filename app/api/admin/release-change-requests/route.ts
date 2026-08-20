import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const admin = await requireAdminPermission("updates.review"); if ("error" in admin) return admin.error;
  const url = new URL(request.url); const status = url.searchParams.get("status") || undefined;
  return NextResponse.json({ requests: await prisma.releaseChangeRequest.findMany({ where: status ? { status } : undefined, orderBy: { submittedAt: "asc" }, take: 100, include: { release: { select: { title: true, artistName: true, status: true } }, events: { orderBy: { createdAt: "asc" } } } }) });
}
// vercel trigger 9
