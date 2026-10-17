import { cronHandler } from "@/lib/cron/runtime";
export const GET = cronHandler("draft-nudges", runJob);
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createNotificationOnce } from "@/lib/notifications";
async function runJob(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const cutoff = new Date(Date.now() - Number(process.env.DRAFT_NUDGE_HOURS ?? 24) * 3_600_000);
  const drafts = await prisma.$queryRaw<Array<{ id: number; userId: number; title: string }>>`
    SELECT r.id, r.user_id AS "userId", r.title FROM releases r JOIN users u ON u.id=r.user_id
    WHERE r.status='DRAFT' AND r.archived_at IS NULL AND u.status='ACTIVE' AND r.updated_at <= ${cutoff}
    AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.event_key='release:' || r.id || ':draft_nudge')
    ORDER BY r.updated_at, r.id LIMIT 100`;
  const deadline = Date.now() + 40000;
  let checked = 0;
  for (const draft of drafts) {
    if (Date.now() >= deadline) break;
    await createNotificationOnce({ eventKey: `release:${draft.id}:draft_nudge`, userId: draft.userId, title: "Continue your release", body: `Your draft “${draft.title}” is waiting for you. Finish the missing details when you're ready.`, type: "release", href: `/distribution/start?edit=${draft.id}`, actionLabel: "Continue draft" });
    checked++;
  }
  return NextResponse.json({ checked, deferred: drafts.length - checked });
}
