import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PayoutProfileReviewQueue } from "@/components/payout-profile-review-queue";
export default async function PayoutProfilesPage() { const admin = await requireAdminPermission("kyc.review"); if ("error" in admin) redirect("/admin/login"); const profiles = await prisma.payoutCredential.findMany({ include: { user: { select: { name: true, email: true } } }, orderBy: { updatedAt: "asc" }, take: 250 }); const safe = profiles.map(profile => ({ id: profile.id, userId: profile.userId, userName: profile.user.name, userEmail: profile.user.email, status: profile.status, method: profile.method, legalName: profile.accountHolderName ?? profile.user.name, country: "", taxResidency: "", panLastFour: null, account: profile.bankAccountMasked ?? profile.upiIdMasked, updatedAt: profile.updatedAt })); return <main className="mx-auto max-w-7xl p-6"><h1 className="text-3xl font-semibold">Manual payout-profile verification</h1><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Review masked customer-submitted details. This is an internal manual review, not government or bank verification.</p><PayoutProfileReviewQueue initialProfiles={JSON.parse(JSON.stringify(safe))} /></main>; }
// vercel trigger 9

// vercel trigger 11
