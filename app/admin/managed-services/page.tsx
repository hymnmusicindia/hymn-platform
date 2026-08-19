import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ManagedServiceReviewQueue } from "@/components/managed-service-review-queue";
export default async function ManagedServiceAdminPage() { const admin = await requireAdminPermission("services.manage"); if ("error" in admin) redirect("/admin/login"); const requests = await prisma.managedServiceRequest.findMany({ include: { user: { select: { name: true, email: true } }, release: { select: { title: true, artistName: true } }, documents: { include: { asset: { select: { id: true, safeFilename: true } } } }, providerStatuses: { orderBy: { provider: "asc" } } }, orderBy: { submittedAt: "asc" }, take: 250 }); return <main className="mx-auto max-w-7xl p-6"><h1 className="text-3xl font-semibold">Managed-service review</h1><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Manual eligibility, partner submission, and completion queue. Never mark partner-facing states without a real partner reference.</p><ManagedServiceReviewQueue initialRequests={JSON.parse(JSON.stringify(requests))} /></main>; }
// vercel trigger 9
