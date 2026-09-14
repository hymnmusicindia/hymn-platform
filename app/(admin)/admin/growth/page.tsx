import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { growthReport } from "@/lib/growth-report";

export default async function GrowthPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const admin = await requireAdminPermission("audit.read"); if ("error" in admin) redirect("/admin/login");
  const query = await searchParams; const days = [7, 30, 90].includes(Number(query.days)) ? Number(query.days) : 30;
  const since = new Date(Date.now() - days * 86400000);
  const report = await growthReport(since, new Date());
  const totalSpend = report.reduce((sum, row) => sum + row.spend, 0);
  const secondArtists = report.reduce((sum, row) => sum + row.second, 0);
  const [counts] = await Promise.all([
    prisma.growthEvent.groupBy({ by: ["event", "source"], where: { createdAt: { gte: since } }, _count: true }),
    prisma.campaignSpend.aggregate({ where: { spentAt: { gte: since } }, _sum: { amountCents: true } }),
    prisma.growthEvent.groupBy({ by: ["campaign", "event"], where: { createdAt: { gte: since } }, _count: true })
  ]);
  return <main className="shell py-12">
    <h1 className="text-3xl font-semibold">Growth</h1>
    <nav className="my-6 flex flex-wrap gap-4"><Link href="/admin/campaigns">Campaigns and spend</Link><Link href="/admin/leads">Inquiries</Link><Link href="/admin/referrals">Referrals</Link><Link href="/admin/partners">Partners</Link><Link href="/admin/growth/reward-policy">Reward policy</Link>{[7, 30, 90].map(n => <Link key={n} href={`?days=${n}`} aria-current={days === n ? "page" : undefined}>{n} days</Link>)}</nav>
    <p className="mb-6">Recorded activity since {since.toLocaleDateString("en-IN")}. Attribution uses first touch. Historical activity before tracking was enabled is unavailable.</p>
    <section className="surface-card mb-6 p-6"><h2 className="text-xl font-semibold">Cost per second-release artist</h2><strong className="my-3 block text-3xl">{secondArtists ? `₹${(totalSpend / 100 / secondArtists).toFixed(2)}` : "Not enough data"}</strong><p className="text-sm">₹{totalSpend / 100} recorded spend / {secondArtists} artists who signed up and began their second release in this period. Compare matched acquisition periods; recent cohorts need time to mature.</p></section>
    <div className="grid gap-4 sm:grid-cols-3">{counts.filter(row => !row.event.endsWith("observation_completed")).map(row => <section key={`${row.event}:${row.source}`} className="surface-card p-5"><p>{row.event.replaceAll("_", " ")}</p><strong className="text-2xl">{row._count}</strong><p className="text-xs">{row.source === "server" ? "Verified server event" : "Browser activity"}</p></section>)}</div>
    <h2 className="my-6 text-xl font-semibold">Campaign performance</h2><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead><tr>{["Campaign", "Spend", "Visitors", "Signups", "Starts", "Submissions", "Live", "Second-release artists", "Subscribers", "Renewals", "Gross paid revenue", "Cost / signup", "Cost / submission", "Cost / paying artist", "Cost / second release"].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{report.map(row => <tr key={row.campaign}>{[row.campaign, `₹${row.spend / 100}`, row.visitors, row.signups, row.starts, row.submissions, row.live, row.second, row.subscribers, row.renewals, `₹${row.revenue / 100}`, ...[row.signups, row.submissions, row.paying, row.second].map(count => count ? `₹${(row.spend / 100 / count).toFixed(2)}` : "—")].map((value, index) => <td className="p-3" key={index}>{value}</td>)}</tr>)}</tbody></table></div>
    <p className="mt-4 text-sm">Revenue is gross verified INR payments; refunds and reversals remain in financial reporting. Visitor counts use first-party browser identifiers, not a count of people.</p>
    {!counts.length && <p className="mt-6">No growth events recorded in this period.</p>}
  </main>;
}
