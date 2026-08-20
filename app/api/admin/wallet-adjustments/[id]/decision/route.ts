import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRecentAdminPermission } from "@/lib/access";
import { decideFinancialAdjustment } from "@/lib/financial-adjustments";
const schema = z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().trim().min(10).max(2000) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { const admin = await requireRecentAdminPermission("wallets.adjust"); if ("error" in admin) return admin.error; if (!("sub" in admin)) return NextResponse.json({ error: "Database-backed administrator session required." }, { status: 403 }); try { const body = schema.parse(await request.json()); return NextResponse.json({ adjustment: await decideFinancialAdjustment({ id: Number((await context.params).id), approvedBy: Number(admin.sub), ...body }) }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Adjustment decision failed." }, { status: 400 }); } }
// vercel trigger 9
