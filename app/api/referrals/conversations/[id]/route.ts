import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { referralConversation, sendReferralMessage } from "@/lib/referral-chat";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { referralJson } from "@/lib/referral-request";

type Context = { params: Promise<{ id: string }> };
const idOf = (value: string) => /^[1-9][0-9]{0,9}$/.test(value) ? Number(value) : 0;
const privateHeaders = { "Cache-Control": "private, no-store" };
function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || [new URL(request.url).origin, new URL(getPublicAppUrl(request.url)).origin].includes(origin);
}
export async function GET(request: Request, context: Context) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  const rate = await consumeRateLimit({ scope: "referral.chat.read", identity: String(auth.user.id), limit: 120, windowSeconds: 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Please wait before refreshing messages." }, { status: 429 });
  const id = idOf((await context.params).id);
  const conversation = id ? await referralConversation(id, auth.user.id) : null;
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const url = new URL(request.url), before = idOf(url.searchParams.get("before") || ""), after = idOf(url.searchParams.get("after") || "");
  const messages = await prisma.referralMessage.findMany({ where: { referralId: id, ...(before ? { id: { lt: before } } : after ? { id: { gt: after } } : {}) }, orderBy: { id: after ? "asc" : "desc" }, take: 51, select: { id: true, senderId: true, body: true, createdAt: true, clientKey: true } });
  const page = messages.slice(0, 50);
  return NextResponse.json({ messages: after ? page : page.reverse(), hasMore: messages.length > 50, userId: auth.user.id, conversation: { id, person: conversation.userId === auth.user.id ? conversation.referredUser : conversation.owner, relationship: conversation.userId === auth.user.id ? "Your referral" : "Your referrer", joinedAt: conversation.registeredAt || conversation.createdAt, latest: null, unread: 0, blocked: conversation.ownerBlocked || conversation.followerBlocked, blockedByYou: conversation.userId === auth.user.id ? conversation.ownerBlocked : conversation.followerBlocked } }, { headers: privateHeaders });
}
export async function POST(request: Request, context: Context) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  if (!validOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 10000) return NextResponse.json({ error: "Message too long." }, { status: 413 });
  const rate = await consumeRateLimit({ scope: "referral.chat", identity: String(auth.user.id), limit: 30, windowSeconds: 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Please wait before sending another message." }, { status: 429 });
  const id = idOf((await context.params).id);
  const parsed = z.object({ body: z.string().trim().min(1).max(2000), clientKey: z.string().uuid() }).safeParse(await referralJson(request));
  if (!id || !parsed.success) return NextResponse.json({ error: "Enter a message of up to 2,000 characters." }, { status: 400 });
  try {
    const message = await sendReferralMessage(id, auth.user.id, parsed.data.body, parsed.data.clientKey);
    return message ? NextResponse.json({ message }, { status: 201 }) : NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "This conversation is paused." ? error.message : "Message could not be sent. Try again." }, { status: 409 });
  }
}
export async function PATCH(request: Request, context: Context) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  if (!validOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const id = idOf((await context.params).id);
  const rate = await consumeRateLimit({ scope: "referral.chat.preferences", identity: String(auth.user.id), limit: 120, windowSeconds: 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Please wait before updating this conversation." }, { status: 429 });
  const input = z.object({ blocked: z.boolean().optional(), readThrough: z.number().int().positive().optional() }).refine(value => value.blocked !== undefined || value.readThrough !== undefined).safeParse(await referralJson(request));
  if (!id || !input.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const updated = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM referrals WHERE id = ${id} FOR UPDATE`;
    const referral = await tx.referral.findFirst({ where: { id, OR: [{ userId: auth.user.id }, { referredUserId: auth.user.id }], owner: { status: "ACTIVE" }, referredUser: { status: "ACTIVE" }, status: { not: "REJECTED" } } });
    if (!referral) return false;
    const owner = referral.userId === auth.user.id;
    const message = input.data.readThrough ? await tx.referralMessage.findFirst({ where: { referralId: id, id: input.data.readThrough } }) : null;
    const previous = owner ? referral.ownerReadAt : referral.followerReadAt;
    const readAt = message && (!previous || message.createdAt > previous) ? message.createdAt : undefined;
    await tx.referral.update({ where: { id }, data: { ...(readAt ? owner ? { ownerReadAt: readAt } : { followerReadAt: readAt } : {}), ...(input.data.blocked !== undefined ? owner ? { ownerBlocked: input.data.blocked } : { followerBlocked: input.data.blocked } : {}) } });
    return true;
  });
  return updated ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Conversation not found." }, { status: 404 });
}
