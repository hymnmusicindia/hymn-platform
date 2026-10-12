import type { Metadata } from "next";
import { getCurrentUserForPage } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ProducerOnboarding } from "@/components/producer-onboarding";
import { producerSetup } from "@/lib/producer-setup";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Start your producer store", robots: { index: false, follow: false } };

export default async function ProducerOnboardingPage() {
  const user = await getCurrentUserForPage();
  const producer = user?.role === "producer";
  const [profile, beats] = producer ? await Promise.all([
    prisma.producerProfile.findUnique({ where: { userId: user.id }, select: { displayName: true, avatarUrl: true, coverPhotoUrl: true, slug: true, bio: true, location: true, specialty: true, tags: true, instagramUrl: true, youtubeUrl: true, spotifyUrl: true, websiteUrl: true, status: true, active: true } }),
    prisma.beat.findMany({ where: { userId: user.id }, select: { status: true, enabled: true } })
  ]) : [null, []];
  return <ProducerOnboarding key={`${user?.id ?? "guest"}:${user?.role ?? "guest"}`} user={user ? { name: user.name, role: user.role, status: user.status, avatarUrl: user.avatarUrl } : null} initialProfile={profile ? { ...profile, tags: Array.isArray(profile.tags) ? profile.tags.filter((tag): tag is string => typeof tag === "string") : [] } : null} uploaded={producerSetup(profile, beats).uploaded} />;
}
