import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserForPage } from "@/lib/access";
import { ownEngineer } from "@/lib/studio-trust";
import { StudioProfileEditor } from "@/components/studio-profile-editor";
import type { StudioProfileInput } from "@/lib/studio-profile";
import { portfolioWorks } from "@/lib/engineer-portfolio";
import { portfolioDaws } from "@/lib/engineer-daws";

export const dynamic = "force-dynamic";
export default async function EngineerProfilePage() {
  const user = await getCurrentUserForPage();
  if (!user) redirect("/login?next=/studio/engineer/profile");
  const profile = await ownEngineer(user.id).catch(() => null);
  if (!profile || profile.sellerState !== "ACTIVE") redirect("/studio/apply");
  const portfolio = profile.portfolio as { banner?: string; socials?: { instagram?: string; youtube?: string }; experience?: StudioProfileInput["experience"] } | null;
  return <main className="shell py-8"><Link href="/studio/engineer" className="text-sm">← Engineer workspace</Link><header className="my-7"><p className="hymn-kicker">Your public profile</p><h1 className="mt-2 text-3xl font-semibold">Make it yours.</h1><p className="mt-3 text-[var(--text-muted)]">Update how clients see your studio. Saved changes appear on your public profile.</p></header><StudioProfileEditor initialDaws={portfolioDaws(profile.portfolio)} slug={profile.slug} initial={{ professionalName: profile.professionalName, bio: profile.bio, profilePhotoUrl: profile.profilePhotoUrl || "", banner: portfolio?.banner || "", instagram: portfolio?.socials?.instagram || "", youtube: portfolio?.socials?.youtube || "", specialties: profile.specialties as StudioProfileInput["specialties"], genres: profile.genres as StudioProfileInput["genres"], works: portfolioWorks(profile.portfolio), experience: portfolio?.experience }}/></main>;
}
