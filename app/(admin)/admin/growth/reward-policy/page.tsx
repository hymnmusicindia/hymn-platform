import { redirect } from "next/navigation";
import Link from "next/link";
import { requireRecentAdminPermission, requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { rewardPolicySchema } from "@/lib/referral-reward-policy";

async function save(form: FormData) {
  "use server";
  const admin = await requireRecentAdminPermission("wallets.adjust"); if ("error" in admin) redirect("/admin/login");
  const input = rewardPolicySchema.safeParse(Object.fromEntries([...form.entries()].filter(([key]) => !key.startsWith("$")).map(([key, value]) => [key, Number(value)])));
  if (!input.success) redirect("/admin/growth/reward-policy?error=invalid");
  await prisma.$transaction(async tx => {
    const before = await tx.growthRewardPolicy.findUniqueOrThrow({ where: { id: 1 } });
    await tx.growthRewardPolicy.update({ where: { id: 1 }, data: input.data });
    await tx.auditLog.create({ data: { actorType: "admin", actorId: "sub" in admin ? Number(admin.sub) : null, action: "GROWTH_REWARD_POLICY_UPDATED", entity: "growth_reward_policy", entityId: "1", metadata: { before: { artistCredit: before.artistCredit, coolingDays: before.coolingDays, halfYearlyCommission: before.halfYearlyCommission, annualCommission: before.annualCommission, labelCommission: before.labelCommission, payoutMinimum: before.payoutMinimum }, after: input.data } } });
  });
  redirect("/admin/growth/reward-policy?saved=1");
}
export default async function RewardPolicyPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const admin = await requireAdminPermission("wallets.adjust"); if ("error" in admin) redirect("/admin/login");
  const policy = await prisma.growthRewardPolicy.findUniqueOrThrow({ where: { id: 1 } });
  const params = await searchParams;
  return <main className="shell py-12"><Link href="/admin/growth">Growth overview</Link><h1 className="my-6 text-3xl font-semibold">Future referral rewards</h1><p className="mb-6">Changes apply to new referral relationships. Previously promised rewards retain their recorded policy. Approval requires recent admin authentication.</p>{params.saved && <p role="status">Policy saved.</p>}{params.error && <p role="alert">Check the policy values.</p>}<form action={save} className="surface-card grid gap-5 p-6 sm:grid-cols-2">{([["artistCredit", "Artist HYMN credit (INR)"], ["coolingDays", "Verification period (days)"], ["halfYearlyCommission", "Partner 6-month commission (INR)"], ["annualCommission", "Partner annual commission (INR)"], ["labelCommission", "Partner Yearly+ commission (INR)"], ["payoutMinimum", "Minimum partner payout (INR)"]] as const).map(([key, label]) => <label key={key} className="grid gap-2 text-sm">{label}<input className="field" type="number" name={key} min={key === "coolingDays" ? 1 : 0} max={key === "coolingDays" ? 90 : key === "payoutMinimum" ? 100000 : 10000} required defaultValue={policy[key]} /></label>)}<button className="btn-primary w-fit">Save future policy</button></form></main>;
}
