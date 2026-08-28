import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export default async function AdminReferralsPage() {
  const admin = await requireAdminPermission("fraud.read"); if ("error" in admin) redirect("/admin/login");
  const [rows, grouped, flagged, visits] = await Promise.all([
    prisma.referral.findMany({ include: { owner: { select: { name: true, email: true } }, referredUser: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 250 }),
    prisma.referral.groupBy({ by: ["status"], _count: true }), prisma.referral.count({ where: { riskStatus: { not: "clear" } } }), prisma.referralVisit.count()
  ]);
  const counts = Object.fromEntries(grouped.map(item => [item.status, item._count])); const rewarded = counts.REWARDED || 0;
  const metrics = [["Referral visits", visits], ["Signups", rows.length], ["Pending", (counts.PENDING || 0) + (counts.REGISTERED || 0)], ["Rewarded", rewarded], ["Credits issued", `₹${rewarded * 8}`], ["Flagged", flagged]];
  return <main className="mx-auto min-h-screen max-w-[1500px] px-5 pb-16 pt-28 sm:px-8 sm:pt-32">
    <p className="eyebrow">Admin workspace · Growth operations</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Referrals</h1><p className="mt-3 max-w-3xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>Inspect attribution, qualification, issued platform credit, reversals, and referral-abuse review signals.</p>
    <section className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{metrics.map(([label, value]) => <div key={String(label)} className="surface-card p-4"><p className="text-xs" style={{ color: "var(--text-soft)" }}>{label}</p><strong className="mt-3 block text-xl">{value}</strong></div>)}</section>
    <section className="surface-card mt-6 overflow-hidden"><div className="border-b p-5" style={{ borderColor: "var(--border)" }}><h2 className="font-semibold">Referral lifecycle</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead><tr style={{ color: "var(--text-soft)" }}>{["ID", "Referrer", "Referred user", "Code", "Attributed", "Qualified", "Status", "Rewards", "Transaction", "Risk"].map(label => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}><td className="px-4 py-4"><Link className="underline" href={`/admin/referrals/${row.id}`}>#{row.id}</Link></td><td className="px-4 py-4">{row.owner.name}<small className="block" style={{ color: "var(--text-soft)" }}>{row.owner.email}</small></td><td className="px-4 py-4">{row.referredUser?.name || "—"}<small className="block" style={{ color: "var(--text-soft)" }}>{row.referredUser?.email || row.signupEmail}</small></td><td className="px-4 py-4">{row.referralCode}</td><td className="px-4 py-4">{row.attributedAt.toLocaleDateString("en-IN")}</td><td className="px-4 py-4">{row.qualifiedAt?.toLocaleDateString("en-IN") || "—"}</td><td className="px-4 py-4">{row.status}</td><td className="px-4 py-4">₹{row.earnings + row.referredReward}</td><td className="px-4 py-4">{row.qualifyingTransactionType || "—"}<small className="block" style={{ color: "var(--text-soft)" }}>{row.qualifyingPaymentId || ""}</small></td><td className="px-4 py-4">{row.riskStatus}</td></tr>)}</tbody></table></div></section>
  </main>;
}
