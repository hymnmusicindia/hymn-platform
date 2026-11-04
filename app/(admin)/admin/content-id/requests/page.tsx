import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ContentIdRequestQueue } from "@/components/content-id-request-queue";

export const dynamic = "force-dynamic";

export default async function ContentIdRequestsPage() {
  const admin = await requireAdminPermission("releases.review");
  if ("error" in admin) redirect("/admin/login");

  const requests = await prisma.contentIdAccess.findMany({
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    include: {
      user: { select: { id: true, name: true, email: true } },
      release: {
        select: {
          id: true,
          title: true,
          artistName: true,
          artworkUrl: true,
          tracks: { orderBy: { trackNumber: "asc" }, select: { id: true, title: true, trackNumber: true } }
        }
      },
      distributionOrder: {
        select: { id: true, amount: true, creditsUsed: true, paymentStatus: true, razorpayPaymentId: true, createdAt: true }
      },
      reviewedBy: { select: { id: true, name: true, email: true } }
    }
  });

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>Distribution operations</p>
        <h1 className="mt-2 text-3xl font-semibold">YouTube Content ID requests</h1>
        <p className="mt-2 max-w-3xl text-sm" style={{ color: "var(--text-muted)" }}>
          Review paid account-access requests, verify the release and channel details, and approve, retain, or decline each request.
        </p>
      </header>
      <ContentIdRequestQueue initialRequests={JSON.parse(JSON.stringify(requests))} />
    </main>
  );
}
