import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  const raw = new URL(request.url).searchParams.get("cursor");
  const cursor = raw && /^[1-9][0-9]{0,9}$/.test(raw) ? Number(raw) : undefined;
  const rows = await prisma.referral.findMany({ where: { endedAt:null,status: { not: "REJECTED" }, OR: [{ userId: auth.user.id }, { referredUserId: auth.user.id }], owner: { status: "ACTIVE" }, referredUser: { status: "ACTIVE" }, ...(cursor ? { id: { lt: cursor } } : {}) }, orderBy: { id: "desc" }, take: 31, include: { owner: { select: { id: true, name: true, avatar: true, handle: { select: { tag: true } } } }, referredUser: { select: { id: true, name: true, avatar: true, handle: { select: { tag: true } } } }, messages: { orderBy: { id: "desc" }, take: 1 } } });
  const page = rows.slice(0, 30);
  const unread = page.length ? await prisma.referralMessage.groupBy({ by: ["referralId"], where: { senderId: { not: auth.user.id }, OR: page.map(row => ({ referralId: row.id, createdAt: { gt: (row.userId === auth.user.id ? row.ownerReadAt : row.followerReadAt) || new Date(0) } })) }, _count: true }) : [];
  const conversations = page.map(row => {
    const isOwner = row.userId === auth.user.id;
    return { id: row.id, person: isOwner ? row.referredUser : row.owner, relationship: isOwner ? "Your referral" : "Your referrer", joinedAt: row.registeredAt || row.createdAt, blocked: row.ownerBlocked || row.followerBlocked, blockedByYou: isOwner ? row.ownerBlocked : row.followerBlocked, latest: row.messages[0]?.body || null, unread: unread.find(item => item.referralId === row.id)?._count || 0 };
  });
  return NextResponse.json({ conversations, nextCursor: rows.length > 30 ? rows[29].id : null }, { headers: { "Cache-Control": "private, no-store" } });
}
