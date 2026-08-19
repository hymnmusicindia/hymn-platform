import { NextResponse } from "next/server";
import {
  getUnreadNotificationCount,
  listNotificationsByUser,
  markAllNotificationsRead,
  markNotificationRead
} from "@/lib/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? 20);
  const [notifications, unreadCount] = await Promise.all([
    listNotificationsByUser(session.sub, Number.isFinite(limit) ? limit : 20),
    getUnreadNotificationCount(session.sub)
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "mark-read") {
    const notificationId = Number(body.notificationId);
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return NextResponse.json({ error: "Valid notificationId is required." }, { status: 400 });
    }

    const updated = await markNotificationRead(session.sub, notificationId);
    if (!updated) return NextResponse.json({ error: "Notification not found." }, { status: 404 });

    const unreadCount = await getUnreadNotificationCount(session.sub);
    return NextResponse.json({ success: true, unreadCount });
  }

  if (action === "mark-all-read") {
    await markAllNotificationsRead(session.sub);
    const unreadCount = await getUnreadNotificationCount(session.sub);
    return NextResponse.json({ success: true, unreadCount });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}

export const PATCH = POST;

// vercel trigger
