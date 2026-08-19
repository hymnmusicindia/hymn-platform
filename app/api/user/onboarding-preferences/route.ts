import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { saveOnboardingPreferences, validateOnboardingPreferences } from "@/lib/onboarding";
import { languageCodes } from "@/lib/i18n/languages";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { name: true, mobile: true, contactEmail: true, dateOfBirth: true, preferredLanguage: true, onboardingUserType: true, referralSource: true } });
  return NextResponse.json({ preferences: user ? { ...user, dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10) ?? null } : null });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const preferences = validateOnboardingPreferences(await request.json());
    await saveOnboardingPreferences(session.sub, preferences);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save preferences." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 120);
  if (typeof body.mobile === "string") data.mobile = body.mobile.trim().slice(0, 30) || null;
  if (typeof body.contactEmail === "string") {
    if (body.contactEmail && !/^\S+@\S+\.\S+$/.test(body.contactEmail)) return NextResponse.json({ error: "Enter a valid contact email." }, { status: 400 });
    data.contactEmail = body.contactEmail.trim() || null;
  }
  if (typeof body.preferredLanguage === "string" && languageCodes.has(body.preferredLanguage)) data.preferredLanguage = body.preferredLanguage;
  if (typeof body.onboardingUserType === "string") data.onboardingUserType = body.onboardingUserType.slice(0, 80);
  if (typeof body.dateOfBirth === "string") {
    const dob = new Date(`${body.dateOfBirth}T00:00:00.000Z`);
    if (Number.isNaN(dob.getTime()) || dob > new Date()) return NextResponse.json({ error: "Enter a valid date of birth." }, { status: 400 });
    data.dateOfBirth = dob;
  }
  await prisma.user.update({ where: { id: session.sub }, data });
  return NextResponse.json({ success: true });
}

