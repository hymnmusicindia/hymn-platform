import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const id = Number((await context.params).id);
  const payload = await request.json().catch(() => null);
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!Number.isInteger(id) || id < 1 || body.length > 1200) return NextResponse.json({ error: "Review text must be 1,200 characters or fewer." }, { status: 400 });
  const updated = await prisma.purchaseReview.updateMany({ where: { id, userId: session.sub }, data: { body: body || null, status: "pending", featured: false } });
  if (!updated.count) return NextResponse.json({ error: "Review not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}
