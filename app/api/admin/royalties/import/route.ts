import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { createAdminEarningsEntry } from "@/lib/payout";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const admin = await requireAdmin(); if (typeof admin === "object" && "error" in admin) return admin.error;
  const form = await request.formData(); const file = form.get("file"); const confirm = form.get("confirm") === "true";
  if (!(file instanceof File)) return NextResponse.json({ error: "CSV or XLSX statement file is required." }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Statement file must be 5 MB or smaller." }, { status: 413 });
  const extension = file.name.split(".").pop()?.toLowerCase(); if (!extension || !["csv", "xlsx"].includes(extension)) return NextResponse.json({ error: "Only CSV and XLSX files are accepted." }, { status: 400 });
  const workbook = new ExcelJS.Workbook(); const buffer = Buffer.from(await file.arrayBuffer());
  if (extension === "csv") await workbook.csv.read(buffer as any); else await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0]; if (!sheet) return NextResponse.json({ error: "The statement contains no worksheet." }, { status: 400 });
  const headers = (sheet.getRow(1).values as any[]).slice(1).map((v) => String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  const rows: Record<string, any>[] = []; sheet.eachRow((row, index) => { if (index === 1) return; const values = (row.values as any[]).slice(1); if (values.some((v) => v !== null && v !== undefined && v !== "")) rows.push(Object.fromEntries(headers.map((header, i) => [header, values[i]]))); });
  if (rows.length > 5000) return NextResponse.json({ error: "A maximum of 5,000 statement rows can be imported at once." }, { status: 400 });
  const matched: any[] = []; const unmatched: any[] = [];
  for (const row of rows) {
    const isrc = String(row.isrc || "").trim(); const upc = String(row.upc || "").trim();
    const track = isrc ? await prisma.track.findFirst({ where: { isrc: { equals: isrc, mode: "insensitive" } }, include: { release: true } }) : null;
    const release = track?.release ?? (upc ? await prisma.release.findFirst({ where: { upc }, include: { tracks: true } }) : null);
    if (!release) {
      const sourceKey = createHash("sha256").update(JSON.stringify(row)).digest("hex");
      unmatched.push({ sourceKey, isrc, upc, reason: "No ISRC or UPC match", row });
      continue;
    }
    matched.push({ row, release, track });
  }
  if (!confirm) return NextResponse.json({ preview: true, matched: matched.map(({ row, release, track }) => ({ releaseId: release.id, releaseTitle: release.title, trackId: track?.id ?? null, isrc: row.isrc, upc: row.upc, platform: row.platform, grossRevenue: row.gross_revenue, artistPoolAmount: row.artist_pool_amount || row.net_revenue })), unmatched, requiresConfirmation: true });
  for (const item of unmatched) {
    const rawMonth = item.row.statement_month ? new Date(String(item.row.statement_month)) : null;
    const statementMonth = rawMonth && !Number.isNaN(rawMonth.getTime()) ? rawMonth : null;
    await (prisma as any).unmatchedRoyaltyRow.upsert({
      where: { sourceKey: item.sourceKey },
      create: { sourceKey: item.sourceKey, importReference: file.name, statementMonth, upc: item.upc || null, isrc: item.isrc || null, rawData: item.row },
      update: { importReference: file.name, statementMonth, upc: item.upc || null, isrc: item.isrc || null, rawData: item.row }
    });
  }
  const imported = [];
  for (const item of matched) { const row = item.row; const date = row.statement_month instanceof Date ? row.statement_month : new Date(String(row.statement_month || "")); const month = Number(row.statement_month_number || (Number.isNaN(date.getTime()) ? 0 : date.getUTCMonth() + 1)); const year = Number(row.statement_year || (Number.isNaN(date.getTime()) ? 0 : date.getUTCFullYear())); imported.push(await createAdminEarningsEntry({ actorId: "sub" in admin ? admin.sub : null, userId: item.release.userId, releaseId: item.release.id, statementMonth: month, statementYear: year, platform: String(row.platform || "Unknown"), territory: String(row.territory || "") || undefined, grossEarning: Number(row.gross_revenue || 0), distributorDeduction: Number(row.distributor_deduction || 0), hymnCommission: Number(row.hymn_commission || 0), artistNetPayable: Number(row.artist_pool_amount || row.net_revenue || 0), sourceReference: String(row.source_reference || file.name), adminNote: `Imported from ${file.name}` })); }
  return NextResponse.json({ imported: imported.length, unmatched, confirmed: true });
}
// vercel trigger 5
