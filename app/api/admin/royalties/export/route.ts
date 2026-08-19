import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export async function GET() {
  const admin = await requireAdmin(); if (typeof admin === "object" && "error" in admin) return admin.error;
  const workbook = new ExcelJS.Workbook(); workbook.creator = "HYMN"; workbook.created = new Date();
  const sets: Array<[string, any[]]> = await Promise.all([
    (prisma as any).royaltyLineItem.findMany({ orderBy: { createdAt: "desc" } }).then((r: any[]) => ["Royalty Line Items", r]),
    (prisma as any).splitRecord.findMany({ orderBy: { createdAt: "desc" } }).then((r: any[]) => ["Split Records", r]),
    (prisma as any).splitRecipient.findMany({ orderBy: { createdAt: "desc" } }).then((r: any[]) => ["Split Recipients", r]),
    (prisma as any).splitEarningLineItem.findMany({ orderBy: { createdAt: "desc" } }).then((r: any[]) => ["Split Earnings", r]),
    (prisma as any).walletTransaction.findMany({ orderBy: { createdAt: "desc" } }).then((r: any[]) => ["Wallet Ledger", r]),
    (prisma as any).payoutRequest.findMany({ orderBy: { requestedAt: "desc" } }).then((r: any[]) => ["Payout Requests", r]),
    (prisma as any).auditLog.findMany({ where: { OR: [{ entity: { contains: "split" } }, { entity: { contains: "payout" } }, { entity: { contains: "royalty" } }] }, orderBy: { createdAt: "desc" } }).then((r: any[]) => ["Audit Logs", r])
  ] as any);
  for (const [name, rows] of sets) { const sheet = workbook.addWorksheet(name); const safeRows = rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !["bankAccountNumber", "upiId"].includes(key)).map(([key, value]) => [key, typeof value === "object" && value && !(value instanceof Date) ? JSON.stringify(value) : value]))); if (safeRows[0]) { sheet.columns = Object.keys(safeRows[0]).map((key) => ({ header: key, key, width: Math.min(40, Math.max(14, key.length + 2)) })); safeRows.forEach((row) => sheet.addRow(row)); sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 1 }]; } }
  const output = await workbook.xlsx.writeBuffer();
  return new NextResponse(output as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="hymn-financial-export-${new Date().toISOString().slice(0,10)}.xlsx"`, "Cache-Control": "no-store" } });
}
