import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { RoyaltyReconciliationQueue } from "@/components/royalty-reconciliation-queue";

export default async function RoyaltyReconciliationPage() {
  const admin = await requireAdminPermission("royalties.reconcile"); if ("error" in admin) redirect("/admin/login");
  if (!process.env.DATABASE_URL?.trim()) return <main className="mx-auto max-w-7xl p-6"><h1 className="text-3xl font-semibold">Royalty reconciliation</h1><section className="surface-card mt-6"><h2 className="text-xl font-semibold">Database connection required</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Manual royalty review will become available after a PostgreSQL DATABASE_URL is configured on the server.</p><a className="btn-outline mt-5 inline-flex" href="/admin/royalties">Back to Royalty Management</a></section></main>;
  let rows; let releases;
  try {
    [rows, releases] = await Promise.all([
      prisma.unmatchedRoyaltyRow.findMany({ where: { status: "unmatched" }, include: { statement: { select: { provider: true, currency: true } } }, orderBy: { createdAt: "asc" }, take: 250 }),
      prisma.release.findMany({ select: { id: true, title: true, artistName: true, upc: true, tracks: { select: { id: true, title: true, isrc: true }, orderBy: { trackNumber: "asc" } } }, orderBy: { createdAt: "desc" }, take: 500 })
    ]);
  } catch {
    return <main className="mx-auto max-w-7xl p-6"><h1 className="text-3xl font-semibold">Royalty reconciliation</h1><section className="surface-card mt-6"><h2 className="text-xl font-semibold">Database unavailable</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>HYMN could not connect to the royalty database. Verify DATABASE_URL and apply the pending Prisma migrations.</p><a className="btn-outline mt-5 inline-flex" href="/admin/royalties">Back to Royalty Management</a></section></main>;
  }
  return <main className="mx-auto max-w-7xl p-6"><h1 className="text-3xl font-semibold">Royalty reconciliation</h1><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Match unresolved statement rows to verified releases and tracks. Every resolution creates ledger provenance and audit evidence.</p><RoyaltyReconciliationQueue initialRows={JSON.parse(JSON.stringify(rows))} releases={JSON.parse(JSON.stringify(releases))} /></main>;
}
// vercel trigger 9

// vercel trigger 14
