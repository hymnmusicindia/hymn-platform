import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { closeQuarter } from "@/lib/payout/quarters";
import { generatePayoutWorkbook, recordReportFailure } from "@/lib/payout/reports";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requireAdminPermission("payouts.review"); if ("error" in admin) return admin.error;
  const [periods, reports, unmatched] = await Promise.all([
    prisma.payoutPeriod.findMany({ orderBy: [{ year: "desc" }, { quarter: "desc" }, { month: "desc" }] }),
    prisma.payoutReport.findMany({ where: { userId: null }, orderBy: { generatedAt: "desc" }, take: 100 }),
    prisma.unmatchedRoyaltyRow.count({ where: { status: "unmatched" } }),
  ]);
  return NextResponse.json({ periods, reports, unmatched });
}

export async function POST(request: Request) {
  const admin = await requireAdminPermission("payouts.approve"); if ("error" in admin) return admin.error;
  const body = await request.json().catch(() => ({})); const actorId = "sub" in admin ? admin.sub : null;
  try {
    if (body.action === "close-quarter") return NextResponse.json({ period: await closeQuarter(Number(body.quarter), Number(body.year), { actorId, force: Boolean(body.force), note: body.note }) });
    const type = ["monthly", "quarterly", "master"].includes(body.type) ? body.type : "monthly";
    const report = await generatePayoutWorkbook({ type, month: body.month ? Number(body.month) : undefined, quarter: body.quarter ? Number(body.quarter) : undefined, year: Number(body.year), actorId });
    return NextResponse.json({ report: { id: report.id, fileName: report.fileName, status: report.status, generatedAt: report.generatedAt } });
  } catch (error) {
    if (body.action !== "close-quarter") await recordReportFailure({ type: ["monthly", "quarterly", "master"].includes(body.type) ? body.type : "monthly", month: body.month ? Number(body.month) : undefined, quarter: body.quarter ? Number(body.quarter) : undefined, year: Number(body.year) || new Date().getUTCFullYear(), actorId }, error).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reporting operation failed." }, { status: 400 });
  }
}
// vercel trigger 9
