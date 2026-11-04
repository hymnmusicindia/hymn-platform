import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { phoneFeedCursor, phoneNotification } from "@/lib/music-phone-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

/** Read-only, authenticated native feed. No session or notification body is returned. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to HYMN." }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  let cursor: number | null;
  try { cursor = phoneFeedCursor(params.get("after")); }
  catch { return NextResponse.json({ error: "Invalid notification cursor." }, { status: 400, headers }); }
  const account = String(session.sub);
  // New installations/account changes establish a baseline instead of replaying old alerts.
  if (cursor === null || params.get("account") !== account) {
    const latest = await prisma.notification.findFirst({ where: { userId: session.sub }, orderBy: { id: "desc" }, select: { id: true } });
    return NextResponse.json({ account, cursor: latest?.id ?? 0, baseline: true, hasMore: false, items: [] }, { headers });
  }
  const rows = await prisma.notification.findMany({ where: { userId: session.sub, id: { gt: cursor } }, orderBy: { id: "asc" }, take: 51,
    select: { id: true, title: true, type: true, href: true, readAt: true } });
  const page = rows.slice(0, 50);
  return NextResponse.json({ account, cursor: page.at(-1)?.id ?? cursor, baseline: false, hasMore: rows.length > 50,
    items: page.filter(row => !row.readAt).map(phoneNotification) }, { headers });
}
