import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
export async function GET() {
  const session = await getSession(); if (!session) return new NextResponse(null, { status: 401 });
  const row = await prisma.growthCommunicationPreference.findUnique({ where: { userId: session.sub } });
  return NextResponse.json({ reminders: row?.reminders ?? false });
}
export async function POST(request: Request) {
  const session = await getSession(); if (!session) return new NextResponse(null, { status: 401 });
  const body = await request.json().catch(() => ({})); if (typeof body.reminders !== "boolean") return new NextResponse(null, { status: 400 });
  await prisma.growthCommunicationPreference.upsert({ where: { userId: session.sub }, create: { userId: session.sub, reminders: body.reminders }, update: { reminders: body.reminders } });
  return NextResponse.json({ reminders: body.reminders });
}
