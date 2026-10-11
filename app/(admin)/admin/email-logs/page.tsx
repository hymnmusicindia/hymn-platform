import { redirect } from "next/navigation";
import { AdminEmailLogs } from "@/components/admin-email-logs";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getEmailConfig } from "@/lib/email/email-client";

export default async function EmailLogsPage() {
  const admin=await requireAdminPermission("system.manage");
  if("error" in admin)redirect("/admin");
  const logs = await (prisma as any).emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 150 });
  return <main className="shell py-12"><a href="/admin?tab=settings" className="text-sm" style={{ color: "var(--accent)" }}>← Back to settings</a><div className="mt-7"><AdminEmailLogs initialLogs={logs.map((log: any) => ({ ...log, createdAt: log.createdAt.toISOString(), sentAt: log.sentAt?.toISOString() ?? null }))} configured={getEmailConfig().enabled} /></div></main>;
}
// vercel trigger 6
