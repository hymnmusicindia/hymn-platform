import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRecentAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { requestFinancialAdjustment } from "@/lib/financial-adjustments";
const schema = z.object({ userId: z.number().int().positive(), amount: z.union([z.number(), z.string()]), currency: z.string().trim().length(3).optional(), reason: z.string().trim().min(10).max(2000), requestKey: z.string().trim().min(8).max(200) });
export async function GET() { const admin = await requireRecentAdminPermission("wallets.adjust"); if ("error" in admin) return admin.error; return NextResponse.json({ adjustments: await prisma.financialAdjustment.findMany({ include: { subject: { select: { name: true, email: true } }, requester: { select: { name: true } }, approver: { select: { name: true } } }, orderBy: { requestedAt: "desc" }, take: 250 }) }); }
export async function POST(request: Request) { const admin = await requireRecentAdminPermission("wallets.adjust"); if ("error" in admin) return admin.error; if (!("sub" in admin)) return NextResponse.json({ error: "Database-backed administrator session required." }, { status: 403 }); try { const body = schema.parse(await request.json()); return NextResponse.json({ adjustment: await requestFinancialAdjustment({ ...body, requestedBy: Number(admin.sub) }) }, { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Adjustment request failed." }, { status: 400 }); } }
// vercel trigger 9
