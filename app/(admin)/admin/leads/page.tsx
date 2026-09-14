import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { GrowthAdminForm } from "@/components/growth-admin-forms";
export default async function LeadsPage() {
  const admin = await requireAdminPermission("users.manage"); if ("error" in admin) redirect("/admin/login");
  const leads = await prisma.growthLead.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return <main className="shell py-12"><Link href="/admin/growth">Growth overview</Link><h1 className="my-6 text-3xl font-semibold">Inquiries and partner applications</h1><p className="mb-6">Latest 200 inquiries. Status changes and internal notes are retained in the audit log.</p><div className="grid gap-5">{leads.map(lead => <details key={lead.id} className="surface-card p-5"><summary className="cursor-pointer">#{lead.id} · {lead.name} · {lead.kind} · {lead.status} · {lead.createdAt.toLocaleDateString("en-IN")}</summary><p className="my-4">{lead.email} · {lead.phone} · {lead.company} · {lead.interest}</p><p className="mb-4 whitespace-pre-wrap">{lead.message}</p><details className="mb-4"><summary>Acquisition source</summary><pre className="overflow-auto text-xs">{JSON.stringify(lead.attribution, null, 2)}</pre></details><GrowthAdminForm kind="lead" lead={lead} /></details>)}</div></main>;
}
