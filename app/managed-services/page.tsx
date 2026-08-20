import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ManagedServicePortal } from "@/components/managed-service-portal";

export default async function ManagedServicesPage() {
  const result = await requireUser(); if ("error" in result) redirect("/login");
  const [releases, requests] = await Promise.all([
    prisma.release.findMany({ where: { userId: result.user.id }, select: { id: true, title: true, artistName: true, status: true, tracks: { select: { id: true, title: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.managedServiceRequest.findMany({ where: { userId: result.user.id }, include: { release: { select: { title: true } }, documents: { include: { asset: { select: { id: true, safeFilename: true } } } }, providerStatuses: { orderBy: { provider: "asc" } } }, orderBy: { submittedAt: "desc" } }),
  ]);
  return <main className="mx-auto max-w-6xl p-6"><h1 className="text-3xl font-semibold">Managed rights services</h1><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Request CRBT/caller tunes, YouTube OAC, or YouTube Content ID. HYMN reviews and processes every request manually; partner approval and turnaround are not guaranteed.</p><ManagedServicePortal releases={JSON.parse(JSON.stringify(releases))} initialRequests={JSON.parse(JSON.stringify(requests))} /></main>;
}
// vercel trigger 9
