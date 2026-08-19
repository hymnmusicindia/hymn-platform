import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { PayoutProfileReviewQueue } from "@/components/payout-profile-review-queue";
type PayoutProfileRow = { id: number; userId: number; user: { name: string; email: string }; status: string; method: string; legalName: string; country: string; taxResidency: string; panLastFour: string | null; bankAccountMasked: string | null; upiIdMasked: string | null; updatedAt: Date };
export default async function PayoutProfilesPage() { const admin = await requireAdminPermission("kyc.review"); if ("error" in admin) redirect("/admin/login"); const profiles = await prisma.payoutCredential.findMany({ include: { user: { select: { name: true, email: true } } }, orderBy: { updatedAt: "asc" }, take: 250 }) as PayoutProfileRow[]; const safe = profiles.map(profile => ({ id: profile.id, userId: profile.userId, userName: profile.user.name, userEmail: profile.user.email, status: profile.status, method: profile.method, legalName: profile.legalName, country: profile.country, taxResidency: profile.taxResidency, panLastFour: profile.panLastFour, account: profile.bankAccountMasked ?? profile.upiIdMasked, updatedAt: profile.updatedAt })); return <main className="mx-auto max-w-7xl p-6"><h1 className="text-3xl font-semibold">Manual payout-profile verification</h1><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Review masked customer-submitted details. This is an internal manual review, not government or bank verification.</p><PayoutProfileReviewQueue initialProfiles={JSON.parse(JSON.stringify(safe))} /></main>; }
// vercel trigger 9

// vercel trigger 11
