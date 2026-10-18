import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { requireAdminPermission, requireRecentAdminPermission } from "@/lib/access";
import { logAuditEvent } from "@/lib/audit-log";
import { emailLayout, emailText } from "@/lib/email/email-templates";
import { getEmailConfig } from "@/lib/email/email-client";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { prisma } from "@/lib/prisma";
import { isSameAppOrigin } from "@/lib/request-origin";

const TEMPLATE = "account_whatsapp_number_reminder_v1";
const EVENT_PREFIX = `${TEMPLATE}:user:`;
const BATCH_SIZE = 25;
const reminderRoles: UserRole[] = [UserRole.CUSTOMER, UserRole.PRODUCER];

const baseWhere = {
  status: "ACTIVE" as const,
  role: { in: reminderRoles },
  OR: [{ mobile: null }, { mobile: "" }]
};

const pendingWhere = {
  ...baseWhere,
  emailLogs: { none: { eventKey: { startsWith: EVENT_PREFIX } } }
};

export async function GET() {
  const admin = await requireAdminPermission("users.manage");
  if ("error" in admin) return admin.error;
  const [missingMobile, pending, invited] = await Promise.all([
    prisma.user.count({ where: baseWhere }),
    prisma.user.count({ where: pendingWhere }),
    prisma.user.count({ where: { ...baseWhere, emailLogs: { some: { eventKey: { startsWith: EVENT_PREFIX } } } } })
  ]);
  return NextResponse.json({ missingMobile, pending, invited, configured: getEmailConfig().enabled }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const admin = await requireRecentAdminPermission("users.manage");
  if ("error" in admin) return admin.error;
  if (!isSameAppOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  if (!getEmailConfig().enabled) return NextResponse.json({ error: "Email sending is not enabled or configured." }, { status: 503 });

  const body = await request.json().catch(() => null) as { afterId?: unknown } | null;
  const afterId = typeof body?.afterId === "number" && Number.isSafeInteger(body.afterId) && body.afterId >= 0 ? body.afterId : 0;
  const recipients = await prisma.user.findMany({
    where: { ...pendingWhere, id: { gt: afterId } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { id: "asc" },
    take: BATCH_SIZE
  });

  let sent = 0;
  let failed = 0;
  for (const user of recipients) {
    const url = `${getPublicAppUrl()}/${user.role === "PRODUCER" ? "producer/dashboard" : "dashboard"}?tab=settings`;
    const model = {
      title: "Get faster HYMN updates on WhatsApp",
      greeting: `Hi ${user.name || "there"},`,
      body: "Add your WhatsApp number to your HYMN account so our team can share important release and account updates with you faster. Your number stays private and is used for direct account support.",
      ctaLabel: "Add my WhatsApp number",
      ctaUrl: url,
      notice: "Adding a number is optional. You can update or remove it anytime in your account settings."
    };
    const content = emailLayout(model);
    const result = await sendTransactionalEmail({
      to: user.email,
      userId: user.id,
      subject: model.title,
      html: content,
      text: emailText(model),
      template: TEMPLATE,
      eventKey: `${EVENT_PREFIX}${user.id}`,
      entityType: "account_profile",
      entityId: user.id
    });
    if (result.status === "sent" || result.status === "duplicate_skipped") sent += 1;
    else failed += 1;
  }

  const nextCursor = recipients.at(-1)?.id ?? afterId;
  const remaining = await prisma.user.count({ where: { ...pendingWhere, id: { gt: nextCursor } } });
  const actorId = "sub" in admin ? Number(admin.sub) : null;
  await logAuditEvent({
    actorType: "admin",
    actorId,
    actorRole: "admin",
    entityType: "account_profile",
    entityId: "whatsapp_number_reminder",
    action: "account.whatsapp_reminder.batch_sent",
    metadata: { processed: recipients.length, sent, failed, remaining, afterId, nextCursor }
  });

  return NextResponse.json({ processed: recipients.length, sent, failed, remaining, nextCursor, complete: remaining === 0 });
}
