import { randomBytes } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminPermission, requireRecentAdminPermission } from "@/lib/access";
import { recordPartnerPayout, reviewPartnerReward } from "@/lib/growth-partners";
import { getPublicAppUrl } from "@/lib/public-app-url";

async function act(form: FormData) {
  "use server";
  const admin = await requireRecentAdminPermission("wallets.adjust"); if ("error" in admin) redirect("/admin/login");
  const actorId = "sub" in admin ? Number(admin.sub) : null;
  const id = Number(form.get("id")); const action = String(form.get("action")); const note = String(form.get("note") || "").trim();
  if (!Number.isSafeInteger(id) || id < 1 || note.length < 5 || note.length > 1000) redirect("/admin/partners?error=invalid");
  try {
    if (action === "approve_application") {
      await prisma.$transaction(async tx => {
        const lead = await tx.growthLead.findUniqueOrThrow({ where: { id } });
        if (lead.kind !== "partner") throw new Error("Invalid application");
        const partner = await tx.growthPartner.create({ data: { leadId: id, name: lead.name, email: lead.email, code: `HP${randomBytes(8).toString("hex").toUpperCase()}` } });
        await tx.auditLog.create({ data: { actorType: "admin", actorId, action: "PARTNER_APPROVED", entity: "growth_partner", entityId: String(partner.id), reason: note } });
      });
    } else if (action === "suspend" || action === "resume") {
      await prisma.$transaction(async tx => {
        const partner = await tx.growthPartner.update({ where: { id }, data: { status: action === "suspend" ? "suspended" : "approved" } });
        await tx.auditLog.create({ data: { actorType: "admin", actorId, action: `PARTNER_${action.toUpperCase()}`, entity: "growth_partner", entityId: String(id), reason: note, metadata: { status: partner.status } } });
      });
    } else if (["approve", "reject", "reverse"].includes(action)) {
      await reviewPartnerReward({ id, action: action as "approve" | "reject" | "reverse", actorId, note });
    } else if (action === "payout") await recordPartnerPayout(id, note, actorId);
    else throw new Error("Invalid action");
  } catch { redirect("/admin/partners?error=review"); }
  redirect("/admin/partners?saved=1");
}

function Action({ id, action, label }: { id: number; action: string; label: string }) {
  return <form action={act} className="my-3 flex flex-wrap gap-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="action" value={action} /><label className="min-w-0 flex-1 text-sm">{action === "payout" ? "Bank payment reference (already paid manually)" : "Review note"}<input name="note" className="field mt-1" minLength={5} maxLength={1000} required /></label><button className="btn-outline self-end">{label}</button></form>;
}
export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const admin = await requireAdminPermission("wallets.adjust"); if ("error" in admin) redirect("/admin/login");
  const [partners, applications] = await Promise.all([
    prisma.growthPartner.findMany({ orderBy: { id: "desc" }, take: 200, include: { referrals: { include: { reward: true } } } }),
    prisma.growthLead.findMany({ where: { kind: "partner" }, orderBy: { id: "desc" }, take: 200 })
  ]);
  const params = await searchParams;
  return <main className="shell py-12"><Link href="/admin/growth">Growth overview</Link><h1 className="my-6 text-3xl font-semibold">Partner program</h1><Link href="/admin/growth/reward-policy">Future commission policy</Link><p className="my-5">Approve applications after reviewing the program terms with the partner. Payout recording confirms a payment made separately; it does not initiate a bank transfer.</p>{params.saved && <p role="status">Saved.</p>}{params.error && <p role="alert">Action could not be completed. Check eligibility, verification period, payment status and minimum payout.</p>}<h2 className="my-5 text-xl font-semibold">Applications</h2>{applications.filter(lead => !partners.some(partner => partner.leadId === lead.id)).map(lead => <details key={lead.id} className="surface-card mb-4 p-5"><summary>{lead.name} · {lead.interest}</summary><p className="my-3">{lead.email} · {lead.phone} · {lead.company}</p><p>{lead.message}</p><Action id={lead.id} action="approve_application" label="Approve partner" /></details>)}<h2 className="my-5 text-xl font-semibold">Partners and commissions</h2>{partners.map(partner => <section key={partner.id} className="surface-card mb-5 p-5"><h3 className="text-xl font-semibold">{partner.name} · {partner.status}</h3><p className="my-3 break-all">{getPublicAppUrl()}/join?ref={partner.code}</p><p>{partner.referrals.length} signups · ₹{partner.referrals.reduce((sum, row) => sum + (row.reward?.status === "paid" ? row.reward.amount : 0), 0)} paid</p><Action id={partner.id} action={partner.status === "approved" ? "suspend" : "resume"} label={partner.status === "approved" ? "Suspend partner" : "Resume partner"} /><Action id={partner.id} action="payout" label="Record approved commissions as paid" />{partner.referrals.filter(row => row.reward).map(row => <details key={row.id} className="mt-4 border-t pt-4"><summary>Referral #{row.id} · {row.reward!.plan} · ₹{row.reward!.amount} · {row.reward!.status}</summary><p className="my-3">Eligible after {row.reward!.eligibleAt.toLocaleString("en-IN")} · Payment record #{row.reward!.subscriptionPaymentId} · {row.reward!.payoutReference}</p>{row.reward!.status === "pending" && <><Action id={row.reward!.id} action="approve" label="Approve commission" /><Action id={row.reward!.id} action="reject" label="Reject commission" /></>}{["approved", "paid"].includes(row.reward!.status) && <Action id={row.reward!.id} action="reverse" label="Record reversal" />}</details>)}</section>)}</main>;
}
