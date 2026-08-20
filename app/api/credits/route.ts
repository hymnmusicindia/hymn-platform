import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const [user, entries] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.sub }, select: { referralCredits: true } }),
    prisma.creditLedgerEntry.findMany({ where: { userId: session.sub }, orderBy: { createdAt: "desc" }, take: 100 })
  ]);
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  return NextResponse.json({ balance: user.referralCredits, currency: "INR", entries: entries.map(entry => ({ ...entry, amount: Number(entry.amount), balanceAfter: Number(entry.balanceAfter) })) });
}
