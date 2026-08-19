import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { createNotification, listLatestNotifications, listUsers } from "@/lib/db";
import type { NotificationPriority, NotificationType, UserRole } from "@/lib/types";

export const runtime = "nodejs";

function parseType(value: unknown): NotificationType {
  if (value === "release" || value === "beat" || value === "order" || value === "payout" || value === "account") return value;
  return "system";
}

function parsePriority(value: unknown): NotificationPriority {
  if (value === "low" || value === "high") return value;
  return "normal";
}

export async function GET() {
  const result = await requireAdmin();
  if ("error" in result) return result.error;
  const notifications = await listLatestNotifications(100);
  return NextResponse.json({ notifications });
}

export async function POST(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  const message = String(body.body || body.message || "").trim();
  const target = String(body.target || "all");
  const specificUserId = Number(body.userId);

  if (title.length < 3 || message.length < 5) {
    return NextResponse.json({ error: "Title and message are required." }, { status: 400 });
  }

  const users = await listUsers();
  const recipients = users.filter((user) => {
    if (target === "all") return true;
    if (target === "customers") return user.role === "customer";
    if (target === "producers") return user.role === "producer";
    if (target === "admins") return user.role === "admin";
    if (target === "user") return Number.isInteger(specificUserId) && user.id === specificUserId;
    return false;
  });

  if (!recipients.length) return NextResponse.json({ error: "No matching recipients." }, { status: 400 });

  const type = parseType(body.type);
  const priority = parsePriority(body.priority);
  const href = String(body.href || "").trim() || null;
  const actionLabel = String(body.actionLabel || "").trim() || null;

  await Promise.all(recipients.map((user) => createNotification({
    userId: user.id,
    title,
    body: message,
    type,
    priority,
    href,
    actionLabel,
    metadata: { sentByAdmin: true, target, role: user.role as UserRole }
  })));

  return NextResponse.json({ success: true, sent: recipients.length });
}

// vercel trigger
