import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRecentAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { decryptPayoutSecret } from "@/lib/payout/credentials";
import { AdminReferralPayoutActions } from "@/components/admin-referral-payout-actions";
const money = (minor: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(minor / 100);
export default async function ReferralPayoutsPage() {
  const auth = await requireRecentAdminPermission("payouts.review"); if ("error" in auth) redirect("/admin/login");
  const [pendingPayouts, completedPayouts, commissions, groups] = await Promise.all([
    prisma.referralCommissionPayout.findMany({ where: { status: "REQUESTED" }, include: { user: { select: { name: true, email: true } } }, orderBy: { id: "asc" }, take: 100 }),
    prisma.referralCommissionPayout.findMany({ where: { status: { not: "REQUESTED" } }, include: { user: { select: { name: true, email: true } } }, orderBy: { id: "desc" }, take: 25 }),
    prisma.referralCommission.findMany({ include: { referral: { select: { userId: true } } }, orderBy: { id: "desc" }, take: 100 }),
    prisma.referralCommission.groupBy({ by: ["status"], _sum: { netMinor: true } }),
  ]);
  const payouts = [...pendingPayouts, ...completedPayouts];
  return <main className="shell py-28"><Link href="/admin/referrals">← Referrals</Link><h1 className="my-5 text-3xl font-semibold">Referral commissions &amp; payouts</h1><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{groups.map(row => <div className="surface-card p-4" key={row.status}><small>{row.status}</small><strong className="block text-2xl">{money(row._sum.netMinor || 0)}</strong></div>)}</div><h2 className="my-6 text-xl font-semibold">Payout requests</h2><p className="mb-4 text-sm text-[var(--text-muted)]">Bank transfers are made separately. Record the reference after payment; this action does not send money.</p>{payouts.length ? payouts.map(row => {
    const destination = row.destination as Record<string, string | null>;
    const decrypt = (key: string) => destination[key] ? decryptPayoutSecret(destination[key]!) : "";
    return <article className="surface-card mb-4 p-5" key={row.id}><div className="flex flex-wrap justify-between gap-3"><div><strong>#{row.id} · {row.user.name}</strong><p className="text-sm">{row.user.email}</p></div><strong>{money(row.amountMinor)} · {row.status}</strong></div><p className="mt-2 text-sm">{destination.method} · {destination.upiIdMasked || destination.bankAccountMasked} · {destination.legalName}</p>{row.status === "REQUESTED" ? <><details className="my-3"><summary>Verified payment destination</summary><p className="mt-2 select-all text-sm">{destination.method === "UPI" ? decrypt("upiIdEncrypted") : `${destination.accountHolderName} · ${decrypt("bankAccountEncrypted")} · ${decrypt("ifscEncrypted")}`}</p></details><AdminReferralPayoutActions id={row.id}/></> : <p className="mt-2 text-sm">{row.paymentReference || row.adminNote}</p>}</article>;
  }) : <p>No payout requests.</p>}<h2 className="my-6 text-xl font-semibold">Commission ledger</h2><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr>{["Owner", "Purchase", "Collected", "Commission base", "Rate", "Commission", "Status"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{commissions.map(row => <tr key={row.id} className="border-t border-[var(--border)]"><td className="p-3"><Link href={`/admin/referrals/${row.referralId}`}>User #{row.referral.userId}</Link></td><td className="p-3">{row.category}<small className="block">{row.paymentId}</small></td><td className="p-3">{money(row.paidMinor)}</td><td className="p-3">{money(row.baseMinor)}</td><td className="p-3">{row.rateBps / 100}%</td><td className="p-3">{money(row.netMinor)}</td><td className="p-3">{row.status}</td></tr>)}</tbody></table></div></main>;
}
