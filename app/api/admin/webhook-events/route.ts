import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const admin = await requireAdminPermission("audit.read");
  if ("error" in admin) return admin.error;
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const take = 50;
  const [events, total] = await prisma.$transaction([
    prisma.paymentWebhookEvent.findMany({ orderBy: { receivedAt: "desc" }, skip: (page - 1) * take, take }),
    prisma.paymentWebhookEvent.count()
  ]);
  return NextResponse.json({ events, page, pageSize: take, total });
}
// vercel trigger 9
