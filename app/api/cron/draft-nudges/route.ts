import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createNotificationOnce } from "@/lib/notifications";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const cutoff = new Date(Date.now() - Number(process.env.DRAFT_NUDGE_HOURS ?? 24) * 3_600_000);
  const drafts = await prisma.release.findMany({ where: { status: "DRAFT", updatedAt: { lte: cutoff } }, take: 500 });
  for (const draft of drafts) await createNotificationOnce({ eventKey: `release:${draft.id}:draft_nudge`, userId: draft.userId, title: "Continue your release", body: `Your draft “${draft.title}” is waiting for you. Finish the missing details when you're ready.`, type: "release", href: `/distribution/start?draft=${draft.id}`, actionLabel: "Continue draft" });
  return NextResponse.json({ checked: drafts.length });
}
