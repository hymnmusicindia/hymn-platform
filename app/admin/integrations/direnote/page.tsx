import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminAccessForPage } from "@/lib/access";
import { getDireNoteConfig } from "@/lib/direnote/direnote-config";
import { prisma } from "@/lib/prisma";
import { DireNoteReconciliationPanel } from "@/components/direnote-reconciliation-panel";

export default async function DireNoteIntegrationPage() {
  const access = await getAdminAccessForPage();
  if (!access) redirect("/admin/login");
  const [lastSuccess, lastFailure, lastReleaseSync, lastRevenueSync, openDiscrepancies, unmatchedRevenue] = await Promise.all([
    prisma.direNoteLog.findFirst({ where: { success: true }, orderBy: { createdAt: "desc" } }),
    prisma.direNoteLog.findFirst({ where: { success: false }, orderBy: { createdAt: "desc" } }),
    prisma.release.findFirst({ where: { direNoteLastSyncedAt: { not: null } }, orderBy: { direNoteLastSyncedAt: "desc" }, select: { direNoteLastSyncedAt: true } }),
    prisma.direNoteLog.findFirst({ where: { action: "revenue_report", success: true }, orderBy: { createdAt: "desc" } }),
    prisma.direNoteReconciliationDiscrepancy.count({ where: { status: "open" } }),
    prisma.unmatchedRoyaltyRow.count({ where: { status: "unmatched" } })
  ]);
  const config = getDireNoteConfig();
  const date = (value?: Date | null) => value ? value.toLocaleString("en-IN") : "None recorded";
  const metrics = [["Connection", config.isConfigured ? "Configured" : "Needs configuration"], ["Last successful request", date(lastSuccess?.createdAt)], ["Last failed request", date(lastFailure?.createdAt)], ["Last release sync", date(lastReleaseSync?.direNoteLastSyncedAt)], ["Last revenue lookup", date(lastRevenueSync?.createdAt)], ["Open reconciliation issues", String(openDiscrepancies)], ["Unmatched revenue", String(unmatchedRevenue)]];
  return <main className="admin-panel-shell py-6 sm:py-8"><div className="mx-auto max-w-6xl"><section className="surface-card p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Integration monitor</p><h1 className="mt-2 text-3xl font-semibold">DireNote v2.2</h1><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Operational status from HYMN&apos;s persisted integration records. Credentials are never displayed.</p></div><Link href="/admin" className="btn-outline pressable">Back to Admin</Link></div><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{metrics.map(([label, value]) => <div key={label} className="summary-card"><span>{label}</span><strong>{value}</strong></div>)}</div><div className="mt-7 flex flex-wrap gap-3"><Link className="btn-primary pressable" href="/admin?tab=distribution-queue">Open distribution queue</Link><Link className="btn-outline pressable" href="/admin?tab=revenue">Open revenue operations</Link></div></section><DireNoteReconciliationPanel /></div></main>;
}
