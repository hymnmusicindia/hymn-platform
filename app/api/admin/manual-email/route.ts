import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { manualEmailSchema } from "@/lib/manual-email";
import { renderManualEmail } from "@/lib/email/manual-email-template";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { getEmailConfig } from "@/lib/email/email-client";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const admin = await requireAdminPermission("system.manage");
  if ("error" in admin) return admin.error;
  const parsed = z.object({ action: z.enum(["preview", "send"]), draft: manualEmailSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map(issue => issue.message).join(" ") }, { status: 400 });
  const { draft, action } = parsed.data;
  const content = renderManualEmail(draft);
  if (action === "preview") return NextResponse.json(content, { headers: { "Cache-Control": "private, no-store" } });
  if (!getEmailConfig().enabled) return NextResponse.json({ error: "Configure SMTP before sending this draft." }, { status: 503 });
  const recipient = await prisma.user.findUnique({ where: { email: draft.to }, select: { id: true } });
  const result = await sendTransactionalEmail({ ...content, to: draft.to, userId: recipient?.id, template: "manual_branded_email", eventKey: `manual-email:${draft.requestId}`, entityType: "admin_email", entityId: "sub" in admin ? admin.sub : "owner" });
  return NextResponse.json(result, { status: result.status === "sent" || result.status === "duplicate_skipped" ? 200 : 502 });
}
