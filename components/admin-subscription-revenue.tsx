"use client";
import type { SubscriptionRevenueRow } from "@/lib/subscription-revenue";
import { WorkspaceRecords } from "@/components/workspace-records";

const money = (amount: number, currency: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount / 100);
export function AdminSubscriptionRevenue({ rows }: { rows: SubscriptionRevenueRow[] }) {
  const captured = rows.filter(row => row.status === "captured" && row.currency === "INR").reduce((sum, row) => sum + row.amountMinor, 0);
  const manual = rows.filter(row => row.verification === "merchant_confirmation" && row.currency === "INR").reduce((sum, row) => sum + row.amountMinor, 0);
  return <section className="surface-card admin-module-section p-5 sm:p-6">
    <h2 className="text-xl font-semibold">Subscription revenue &amp; approval logs</h2>
    <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Captured gross: {money(captured, "INR")} · Paid gross (manually confirmed): {money(manual, "INR")}. These are subscription receipts, separate from artist royalties. Gateway fees and net settlements are not inferred.</p>
    <WorkspaceRecords rows={rows} rowKey={row => row.id} noun="subscription payments" searchText={row => `${row.email} ${row.plan} ${row.reference} ${row.subscriptionReference} ${row.status}`} columns={[
      { key: "customer", label: "Customer / plan", primary: true, render: row => <><a href={`/admin?tab=users&userId=${row.userId}`}>{row.email}</a><small>{row.plan.replaceAll("_", " ")}</small></> },
      { key: "amount", label: "Gross receipt", value: row => row.amountMinor, render: row => money(row.amountMinor, row.currency) },
      { key: "approval", label: "Subscription", render: row => <span className="status-pill">{row.subscriptionStatus === "active" ? "Approved / active" : row.subscriptionStatus}</span> },
      { key: "verification", label: "Payment evidence", render: row => <><strong>{row.verification === "merchant_confirmation" ? "Paid (manually confirmed)" : row.status}</strong><small>{row.reference}</small>{row.verification === "merchant_confirmation" && <small>Razorpay API verification pending</small>}<small>{row.subscriptionReference}</small></> },
      { key: "date", label: "Recorded", value: row => Date.parse(row.createdAt), render: row => new Date(row.createdAt).toLocaleString("en-IN") }
    ]} />
  </section>;
}
