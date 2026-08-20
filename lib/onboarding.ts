import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/db";
import { languageCodes } from "@/lib/i18n/languages";

export type OnboardingPreferences = {
  name: string; mobile?: string; contactEmail?: string; dateOfBirth: string;
  preferredLanguage: string; purpose: string; userType: string;
  referralSource: string; referralCode?: string; completedAt: string;
};

export function validateOnboardingPreferences(value: unknown): OnboardingPreferences {
  if (!value || typeof value !== "object") throw new Error("Onboarding preferences are required.");
  const input = value as Record<string, unknown>;
  const required = ["name", "dateOfBirth", "preferredLanguage", "purpose", "userType", "referralSource", "completedAt"];
  for (const key of required) if (typeof input[key] !== "string" || !String(input[key]).trim()) throw new Error(`${key} is required.`);
  const dob = new Date(`${input.dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(dob.getTime()) || dob > new Date()) throw new Error("Enter a valid date of birth.");
  if (!languageCodes.has(String(input.preferredLanguage))) throw new Error("Unsupported preferred language.");
  const contactEmail = typeof input.contactEmail === "string" ? input.contactEmail.trim() : "";
  if (contactEmail && !/^\S+@\S+\.\S+$/.test(contactEmail)) throw new Error("Enter a valid contact email.");
  return {
    name: String(input.name).trim().slice(0, 120), mobile: String(input.mobile ?? "").trim().slice(0, 30) || undefined,
    contactEmail: contactEmail.slice(0, 160) || undefined, dateOfBirth: dob.toISOString().slice(0, 10),
    preferredLanguage: String(input.preferredLanguage), purpose: String(input.purpose).slice(0, 80),
    userType: String(input.userType).slice(0, 80), referralSource: String(input.referralSource).slice(0, 80),
    referralCode: String(input.referralCode ?? "").trim().slice(0, 80) || undefined,
    completedAt: new Date(String(input.completedAt)).toISOString()
  };
}

export async function saveOnboardingPreferences(userId: number, input: OnboardingPreferences) {
  const existing = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return prisma.user.update({ where: { id: userId }, data: {
    name: existing.name ? existing.name : input.name,
    mobile: existing.mobile ?? input.mobile, contactEmail: existing.contactEmail ?? input.contactEmail,
    dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00.000Z`), preferredLanguage: input.preferredLanguage,
    onboardingPurpose: input.purpose, onboardingUserType: input.userType, referralSource: existing.referralSource ?? input.referralSource,
    onboardingReferralCode: existing.onboardingReferralCode ?? input.referralCode, onboardingCompletedAt: new Date(input.completedAt),
    onboardingDone: true, onboardingPreferences: input
  }});
}

export async function createBirthdayNotificationForUser(userId: number, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, dateOfBirth: true } });
  if (!user?.dateOfBirth || user.dateOfBirth.getUTCMonth() !== now.getUTCMonth() || user.dateOfBirth.getUTCDate() !== now.getUTCDate()) return false;
  await createNotification({ userId, title: `Happy Birthday, ${user.name}!`, body: "HYMN wishes you a powerful year of releases, growth, and music wins.", type: "account", href: "/dashboard", priority: "normal", actionLabel: "Open workspace", eventKey: `birthday:${userId}:${now.getUTCFullYear()}` });
  return true;
}
