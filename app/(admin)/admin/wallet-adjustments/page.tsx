import { redirect } from "next/navigation";
import { requireRecentAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { WalletAdjustmentQueue } from "@/components/wallet-adjustment-queue";

export default async function WalletAdjustmentsPage() {
  const admin = await requireRecentAdminPermission("wallets.adjust");
  if ("error" in admin || !("sub" in admin)) redirect("/admin/login");
  const adjustments = await prisma.financialAdjustment.findMany({ include: { subject: { select: { name: true, email: true } }, requester: { select: { name: true } }, approver: { select: { name: true } } }, orderBy: { requestedAt: "desc" }, take: 250 });
  return <main className="mx-auto max-w-7xl p-6"><h1 className="text-3xl font-semibold">Dual-control wallet adjustments</h1><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Every adjustment requires a separate administrator to decide it. Applied entries are immutable.</p><WalletAdjustmentQueue initialAdjustments={JSON.parse(JSON.stringify(adjustments))} currentAdminId={Number(admin.sub)} /></main>;
}
// vercel trigger 9
