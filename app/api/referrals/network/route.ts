import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { REFERRAL_NETWORK_RATES_BPS } from "@/lib/referral-commission-policy";

export async function GET(request: Request) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  if (!await prisma.user.findFirst({ where: { id: auth.user.id, status: "ACTIVE" }, select: { id: true } })) return NextResponse.json({ error: "Account unavailable." }, { status: 403 });
  const query = new URL(request.url).searchParams;
  const raw = query.get("parent"), parent = raw && /^[1-9][0-9]{0,9}$/.test(raw) ? Number(raw) : auth.user.id;
  const cursorRaw = query.get("cursor"), cursor = cursorRaw && /^[1-9][0-9]{0,9}$/.test(cursorRaw) ? Number(cursorRaw) : 0;
  // Follow the requested branch back to this owner; never expose unrelated accounts.
  const allowed = parent === auth.user.id ? [{ depth: 0 }] : await prisma.$queryRaw<Array<{ depth: number }>>`
    WITH RECURSIVE ancestors AS (
      SELECT id, 0 AS depth, ARRAY[id] AS visited FROM users WHERE id = ${parent} AND status = 'ACTIVE'
      UNION ALL SELECT u.id, a.depth + 1, a.visited || u.id
      FROM ancestors a JOIN referrals r ON r.referred_user_id = a.id JOIN users u ON u.id = r.user_id
      WHERE a.depth < 6 AND NOT u.id = ANY(a.visited) AND r.status <> 'REJECTED' AND u.status = 'ACTIVE'
    ) SELECT depth FROM ancestors WHERE id = ${auth.user.id}`;
  if (!allowed.length) return NextResponse.json({ error: "Referral branch not found." }, { status: 404 });
  const depth = allowed[0].depth + 1;
  const rows = await prisma.referral.findMany({ where: { userId: parent, referredUserId: { not: null }, status: { not: "REJECTED" }, referredUser: { status: "ACTIVE" }, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: "asc" }, take: 26, include: { referredUser: { select: { id: true, name: true, avatar: true, _count: { select: { sentReferrals: { where: { status: { not: "REJECTED" }, referredUser: { status: "ACTIVE" } } } } } } } } });
  return NextResponse.json({ depth, rateBps: depth === 1 ? null : REFERRAL_NETWORK_RATES_BPS[depth - 1], basis: depth === 1 ? "category" : "direct commission", nodes: rows.slice(0, 25).map(row => ({ referralId: row.id, id: row.referredUser!.id, name: row.referredUser!.name, avatar: row.referredUser!.avatar, children: depth < 7 ? row.referredUser!._count.sentReferrals : 0, joinedAt: row.registeredAt || row.createdAt, direct: depth === 1 })), nextCursor: rows.length > 25 ? rows[24].id : null }, { headers: { "Cache-Control": "private, no-store" } });
}
