import { redirect } from "next/navigation";
import { getCurrentUserForPage } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { EngineerApplicationForm } from "@/components/engineer-application-form";
import "@/app/styles/engineer-application.css";

export const dynamic = "force-dynamic";

export default async function EngineerApplicationPage() {
  const user = await getCurrentUserForPage();
  if (!user) redirect("/login?next=/studio/apply");
  const [application, profile] = await Promise.all([
    prisma.engineerApplication.findUnique({ where: { userId: user.id } }),
    prisma.engineerProfile.findFirst({ where: { contributorParty: { claimedByUserId: user.id } }, select: { id: true, professionalName: true } }),
  ]);
  return <main className="engineer-apply-shell"><EngineerApplicationForm user={{ name: user.name, avatar: null }} application={application ? { ...application, startingPrice: Number(application.startingPrice), createdAt: application.createdAt.toISOString(), updatedAt: application.updatedAt.toISOString() } : null} activeProfile={profile} /></main>;
}
