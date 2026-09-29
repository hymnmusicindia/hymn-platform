import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const presenceSchema = z.enum(["online", "invisible", "do_not_disturb"]);

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { presenceStatus: true } });
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  return NextResponse.json({ presence: presenceSchema.catch("online").parse(user.presenceStatus) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const input = z.object({ presence: presenceSchema }).safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Choose a valid profile status." }, { status: 400 });
  const user = await prisma.user.update({ where: { id: session.sub }, data: { presenceStatus: input.data.presence }, select: { presenceStatus: true } });
  return NextResponse.json({ presence: user.presenceStatus });
}
