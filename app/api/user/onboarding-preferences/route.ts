import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { saveOnboardingPreferences, validateOnboardingPreferences } from "@/lib/onboarding";
import { languageCodes } from "@/lib/i18n/languages";
import { logAuditEvent } from "@/lib/audit-log";
import { ensureAccountClientCard } from "@/lib/team/client-cards";

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
    await ensureAccountClientCard(session.sub).catch(error => console.error("Client card profile sync failed", { userId: session.sub, error }));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save preferences." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const existing = await prisma.user.findUnique({ where: { id: session.sub }, select: { name: true } });
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    if (!body.name.trim() || body.name.trim().length > 120) return NextResponse.json({ error: "Enter a display name of 1 to 120 characters." }, { status: 400 });
    data.name = body.name.trim();
  }
  if (typeof body.mobile === "string") data.mobile = body.mobile.trim().slice(0, 30) || null;
  if (typeof body.contactEmail === "string") {
    if (body.contactEmail.trim() && !/^\S+@\S+\.\S+$/.test(body.contactEmail.trim())) return NextResponse.json({ error: "Enter a valid contact email." }, { status: 400 });
    data.contactEmail = body.contactEmail.trim() || null;
  }
  if (typeof body.preferredLanguage === "string" && languageCodes.has(body.preferredLanguage)) data.preferredLanguage = body.preferredLanguage;
  if (typeof body.onboardingPurpose === "string") data.onboardingPurpose = body.onboardingPurpose.trim().slice(0, 160) || null;
  if (typeof body.onboardingUserType === "string") data.onboardingUserType = body.onboardingUserType.slice(0, 80);
  if (body.dateOfBirth === "") data.dateOfBirth = null;
  else if (typeof body.dateOfBirth === "string") {
    const dob = new Date(`${body.dateOfBirth}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.dateOfBirth) || Number.isNaN(dob.getTime()) || dob.toISOString().slice(0, 10) !== body.dateOfBirth || dob > new Date()) return NextResponse.json({ error: "Enter a valid date of birth." }, { status: 400 });
    data.dateOfBirth = dob;
  }
  await prisma.user.update({ where: { id: session.sub }, data });
  await ensureAccountClientCard(session.sub).catch(error => console.error("Client card profile sync failed", { userId: session.sub, error }));
  if (typeof data.name === "string" && existing?.name !== data.name) {
    await logAuditEvent({ actorType: "user", actorId: session.sub, actorRole: session.role, entityType: "user", entityId: session.sub, action: "account.name.changed", oldValue: { name: existing?.name ?? null }, newValue: { name: data.name }, riskLevel: "normal" });
  }
  return NextResponse.json({ success: true });
}
