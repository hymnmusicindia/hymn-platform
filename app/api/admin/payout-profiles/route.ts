import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
export async function GET() { const admin = await requireAdminPermission("kyc.review"); if ("error" in admin) return admin.error; const profiles = await prisma.payoutCredential.findMany({ include: { user: { select: { name: true, email: true } } }, orderBy: { updatedAt: "asc" }, take: 250 }); return NextResponse.json({ profiles: profiles.map(profile => ({ id: profile.id, userId: profile.userId, userName: profile.user.name, userEmail: profile.user.email, status: profile.status, method: profile.method, legalName: profile.legalName, country: profile.country, taxResidency: profile.taxResidency, panLastFour: profile.panLastFour, account: profile.bankAccountMasked ?? profile.upiIdMasked, submittedAt: profile.submittedAt, updatedAt: profile.updatedAt, note: profile.verificationNote })) }); }
// vercel trigger 9
