import { redirect } from "next/navigation";
import { AdminContributorManager } from "@/components/admin-contributor-manager";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export default async function ContributorAdminPage() {
  const admin = await requireAdminPermission("users.read");
  if ("error" in admin) redirect("/admin/login");
  const contributors = await prisma.contributorParty.findMany({ select: { id: true, publicId: true, professionalName: true, identityState: true, mergedInto: { select: { publicId: true } }, _count: { select: { contributions: true, beats: true, splitRecipients: true } } }, orderBy: { updatedAt: "desc" }, take: 50 });
  return <main className="mx-auto min-h-screen max-w-7xl px-5 pb-16 pt-28 sm:px-8 sm:pt-32"><div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--text-muted)" }}>Admin workspace · Identity</p><h1 className="mt-3 text-3xl font-semibold">Contributor identities</h1><p className="mt-3 max-w-3xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>Review canonical producer and contributor records, their relationships, claim state, and carefully controlled merges.</p></div><AdminContributorManager initialContributors={JSON.parse(JSON.stringify(contributors))} /></main>;
}
