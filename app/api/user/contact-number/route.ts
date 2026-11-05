import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ensureAccountClientCard } from "@/lib/team/client-cards";
import { contactNumberToE164, isSupportedContactDialCode } from "@/lib/contact-phone-countries";
import { UserRole } from "@prisma/client";
import { z } from "zod";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.role !== "customer") return NextResponse.json({ error: "Customer account required." }, { status: 403 });
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { mobile: true } });
  return NextResponse.json({ hasPhone: Boolean(user?.mobile?.trim()) });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.role !== "customer") return NextResponse.json({ error: "Customer account required." }, { status: 403 });
  try {
    const body = z.object({ dialCode: z.string(), phone: z.string().trim().min(1).max(24) }).strict().parse(await request.json());
    if (!isSupportedContactDialCode(body.dialCode) || typeof body.phone !== "string") {
      return NextResponse.json({ error: "Choose a country code and enter your phone number." }, { status: 400 });
    }
    const mobile = contactNumberToE164(body.dialCode, body.phone);
    const account = await prisma.user.findUnique({ where: { id: session.sub }, select: { id: true, role: true, status: true } });
    if (!account || account.role !== UserRole.CUSTOMER || account.status !== "ACTIVE") {
      return NextResponse.json({ error: "An active customer account is required." }, { status: 403 });
    }
    const synced = await ensureAccountClientCard(session.sub, { syncMobileToCard: true, mobile });
    if (!synced?.contactCardSynced) {
      console.error("Customer phone saved but no contact card could be synchronized", { userId: session.sub });
      return NextResponse.json({ error: "Your number was saved, but we could not update your HYMN contact card. Please try again or contact support." }, { status: 503 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Send valid phone details." }, { status: 400 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Choose a country code and enter your phone number." }, { status: 400 });
    if (error instanceof Error && error.message === "Enter a valid phone number with its country code.") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Customer account is no longer active.") {
      return NextResponse.json({ error: "An active customer account is required." }, { status: 403 });
    }
    console.error("Customer contact number could not be saved", { userId: session.sub, error });
    return NextResponse.json({ error: "We couldn't save your number right now. Please try again." }, { status: 500 });
  }
}
