import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createBirthdayNotificationForUser } from "@/lib/onboarding";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const now = new Date();
  const users = await prisma.user.findMany({ where: { dateOfBirth: { not: null } }, select: { id: true } });
  let created = 0;
  for (const user of users) if (await createBirthdayNotificationForUser(user.id, now)) created += 1;
  console.info("birthday-notifications", { checked: users.length, matched: created, date: now.toISOString().slice(0, 10) });
  return NextResponse.json({ success: true, checked: users.length, matched: created });
}

