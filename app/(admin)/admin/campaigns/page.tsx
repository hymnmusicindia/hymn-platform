import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { campaignLink } from "@/lib/growth-domain";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { CopyCampaignLink, GrowthAdminForm } from "@/components/growth-admin-forms";
export default async function CampaignsPage() {
  const admin = await requireAdminPermission("system.manage"); if ("error" in admin) redirect("/admin/login");
  const campaigns = await prisma.marketingCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { spend: true } });
  return <main className="shell py-12"><Link href="/admin/growth">Growth overview</Link><h1 className="my-6 text-3xl font-semibold">Campaigns</h1><details className="surface-card p-5"><summary className="cursor-pointer font-semibold">Create campaign</summary><div className="mt-5"><GrowthAdminForm kind="campaign" /></div></details><div className="mt-6 grid gap-5">{campaigns.map(campaign => { const url = campaignLink(campaign, getPublicAppUrl()); const spend = campaign.spend.reduce((sum, item) => sum + item.amountCents, 0); return <section key={campaign.id} className="surface-card min-w-0 p-5"><h2 className="text-xl font-semibold">{campaign.name}</h2><p className="my-3">{campaign.channel} · {campaign.status} · ₹{spend / 100} spent / ₹{campaign.budgetCents / 100} budget{campaign.budgetCents > 0 && spend >= campaign.budgetCents * .75 ? ` · ${Math.round(spend / campaign.budgetCents * 100)}% used` : ""}</p><CopyCampaignLink url={url} /><p className="my-4 break-all text-sm">{url}</p><p className="mb-4 whitespace-pre-wrap text-sm">{campaign.notes}</p><details><summary className="cursor-pointer">Record spend</summary><div className="mt-4"><GrowthAdminForm kind="spend" campaignId={campaign.id} /></div></details></section>; })}</div></main>;
}
