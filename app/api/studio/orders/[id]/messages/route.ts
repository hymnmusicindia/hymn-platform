import { studioError } from "@/lib/studio-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudioUser as requireUser } from "@/lib/studio-access";
import { assertStudioParticipant, sendStudioMessage } from "@/lib/studio-services";
import { prisma } from "@/lib/prisma";
const schema = z.object({ body: z.string().trim().min(1).max(5000), idempotencyKey: z.string().trim().min(8).max(120), callbackPhone: z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/).optional() });
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
 const auth = await requireUser(); if ("error" in auth) return auth.error;
 try {
  const order = await assertStudioParticipant((await context.params).id, auth.user.id);
  const before = Number(new URL(request.url).searchParams.get("before"));
  if (!Number.isSafeInteger(before) || before < 1) return NextResponse.json({ error: "Invalid history cursor." }, { status: 400 });
  const messages = await prisma.studioMessage.findMany({ where: { orderId: order.id, id: { lt: before } }, include: { sender: { select: { name: true } } }, orderBy: { id: "desc" }, take: 100 });
  return NextResponse.json({ messages: messages.reverse().map(m => ({ ...m, senderName: m.sender?.name ?? null })) }, { headers: { "Cache-Control": "private, no-store" } });
 } catch { return NextResponse.json({ error: "Studio order not found." }, { status: 404 }); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 const auth = await requireUser(); if ("error" in auth) return auth.error;
 try {
  const body = schema.parse(await request.json());
  const recent = await prisma.studioMessage.count({ where: { senderUserId: auth.user.id, createdAt: { gte: new Date(Date.now() - 60000) } } });
  if (recent >= 30) return NextResponse.json({ error: "Please wait a moment before sending more messages." }, { status: 429 });
  const message = await sendStudioMessage({ orderPublicId: (await context.params).id, userId: auth.user.id, ...body });
  return NextResponse.json({ message: { ...message, senderName: message.sender?.name ?? null } }, { status: 201 });
 } catch (error) { return NextResponse.json({ error: studioError(error, "Could not send message.") }, { status: 400 }); }
}
