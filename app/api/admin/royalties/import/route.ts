import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { DIRENOTE_REQUIRED_COLUMNS, normalizeHeader, parseCsv, parseMonth } from "@/lib/direnote-csv";
import { importRoyaltyStatementAtomic, type MatchedRoyaltyImportRow } from "@/lib/royalty-import";
import { prisma } from "@/lib/prisma";
import { localPrivateStorage } from "@/lib/private-storage";
import { createNotificationOnce } from "@/lib/notifications";

export const runtime = "nodejs";
export const maxDuration = 300;

const value = (row: Record<string, string>, key: string) => String(row[key] ?? "").trim();
const number = (raw: string) => { const parsed = Number(raw.replace(/,/g, "")); return Number.isFinite(parsed) ? parsed : null; };

export async function POST(request: Request) {
  const admin = await requireAdminPermission("royalties.import"); if ("error" in admin) return admin.error;
  if (!process.env.DATABASE_URL?.trim()) return NextResponse.json({ error: "Royalty imports are unavailable because DATABASE_URL is not configured on the server." }, { status: 503 });
  const actorId = "sub" in admin ? Number(admin.sub) : 0;
  if (!actorId) return NextResponse.json({ error: "A database-backed finance administrator is required." }, { status: 403 });
  const form = await request.formData(); const file = form.get("file"); const confirm = form.get("confirm") === "true"; const force = form.get("force") === "true";
  const extension = file instanceof File ? file.name.split(".").pop()?.toLowerCase() : null;
  if (!(file instanceof File) || !extension || !["csv", "xlsx"].includes(extension)) return NextResponse.json({ error: "A DireNote CSV or Excel (.xlsx) file is required." }, { status: 400 });
  if (file.size < 1 || file.size > 50 * 1024 * 1024) return NextResponse.json({ error: "The report must be between 1 byte and 50 MB." }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer()); const checksum = createHash("sha256").update(bytes).digest("hex");
  let records: string[][];
  if (extension === "csv") records = parseCsv(bytes.toString("utf8"));
  else {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as any); const sheet = workbook.worksheets[0];
    if (!sheet) return NextResponse.json({ error: "The Excel workbook contains no worksheet." }, { status: 400 });
    records = [];
    sheet.eachRow({ includeEmpty: false }, row => { const values = Array.from({ length: Math.max(sheet.columnCount, row.cellCount) }, (_, index) => { const cell = row.getCell(index + 1); return cell.text?.trim() || String(cell.value ?? "").trim(); }); if (values.some(Boolean)) records.push(values); });
  }
  if (!records.length) return NextResponse.json({ error: "The report is empty." }, { status: 400 });
  const headers = records[0].map(normalizeHeader); const missingColumns = DIRENOTE_REQUIRED_COLUMNS.filter(column => !headers.includes(column));
  if (missingColumns.length) return NextResponse.json({ error: "Mandatory DireNote columns are missing.", missingColumns }, { status: 400 });
  const rows = records.slice(1).map(columns => Object.fromEntries(headers.map((header, index) => [header, String(columns[index] ?? "").trim()])));
  const reportingMonths = [...new Set(rows.map(row => parseMonth(row.reporting_month)?.toISOString()).filter(Boolean))];
  if (reportingMonths.length !== 1) return NextResponse.json({ error: "Every row must contain the same valid Reporting Month." }, { status: 400 });
  const reportingMonth = new Date(reportingMonths[0]!);
  const duplicate = await prisma.royaltyStatement.findFirst({ where: { OR: [{ fileChecksum: checksum }, { originalFileName: file.name, reportingMonth }] }, select: { id: true, originalFileName: true, status: true } });
  if (duplicate && !force) return NextResponse.json({ error: "This report appears to have already been imported.", duplicate, canForce: true }, { status: 409 });

  const [tracks, releases, mappings] = await Promise.all([
    prisma.track.findMany({ where: { isrc: { in: [...new Set(rows.map(row => value(row, "isrc")).filter(Boolean))] } }, include: { release: true } }),
    prisma.release.findMany({ where: { upc: { in: [...new Set(rows.map(row => value(row, "upc")).filter(Boolean))] } }, include: { tracks: true } }),
    prisma.royaltyManualMapping.findMany({ where: { OR: [{ isrc: { in: rows.map(row => value(row, "isrc")).filter(Boolean) } }, { upc: { in: rows.map(row => value(row, "upc")).filter(Boolean) } }] } })
  ]);
  const trackByIsrc = new Map(tracks.map(track => [track.isrc?.toUpperCase(), track])); const releaseByUpc = new Map(releases.map(release => [release.upc?.toUpperCase(), release]));
  const mappingByKey = new Map(mappings.flatMap(mapping => [[`i:${mapping.isrc?.toUpperCase()}`, mapping], [`u:${mapping.upc?.toUpperCase()}`, mapping]]));
  const matched: MatchedRoyaltyImportRow[] = []; const unmatched: Array<{ sourceKey: string; sourceLineNumber: number; statementMonth: Date; isrc: string | null; upc: string | null; rawData: Record<string, string> }> = []; const failed: Array<{ line: number; error: string }> = [];
  for (const [index, row] of rows.entries()) { const line = index + 2; try { const isrc = value(row, "isrc").toUpperCase(); const upc = value(row, "upc").toUpperCase(); const manual = mappingByKey.get(`i:${isrc}`) ?? mappingByKey.get(`u:${upc}`); const track = trackByIsrc.get(isrc); const release = track?.release ?? releaseByUpc.get(upc) ?? (manual ? await prisma.release.findUnique({ where: { id: manual.releaseId } }) : null); const net = number(value(row, "net_revenue")); const salesMonth = parseMonth(row.sales_month); const quantity = number(value(row, "quantity") || "0"); if (net === null || !salesMonth || quantity === null) throw new Error("Invalid revenue, sales month, or quantity"); if (!release) { unmatched.push({ sourceKey: createHash("sha256").update(`${checksum}:${line}`).digest("hex"), sourceLineNumber: line, statementMonth: reportingMonth, isrc: isrc || null, upc: upc || null, rawData: row }); continue; } matched.push({ releaseId: release.id, trackId: track?.id ?? manual?.trackId ?? null, userId: release.userId, isrc: isrc || null, upc: upc || null, sourceLineNumber: line, statementMonth: reportingMonth, salesMonth, salesType: value(row, "sales_type"), platform: value(row, "platform") || "Unknown", territory: value(row, "country") || null, grossRevenue: net, serviceFee: 0, netRevenue: net, quantity: Math.trunc(quantity), streams: value(row, "sales_type").toLowerCase().includes("stream") ? Math.trunc(quantity) : null, downloads: value(row, "sales_type").toLowerCase().includes("download") ? Math.trunc(quantity) : null, originalValues: row }); } catch (error) { failed.push({ line, error: error instanceof Error ? error.message : "Invalid row" }); } }
  const preview = { preview: true, checksum, reportingMonth, rows: rows.length, matched: matched.length, unmatched: unmatched.length, failed: failed.length, failedRows: failed.slice(0, 100), totalRevenue: matched.reduce((sum, row) => sum + Number(row.netRevenue), 0), requiresConfirmation: true };
  if (!confirm) return NextResponse.json(preview);
  const stored = await localPrivateStorage.upload({ ownerUserId: actorId, assetType: "private_royalty_statement", fileName: file.name, mimeType: extension === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes });
  const result = await importRoyaltyStatementAtomic({ provider: "DireNote", currency: value(rows[0], "currency").toUpperCase(), periodStart: reportingMonth, periodEnd: new Date(Date.UTC(reportingMonth.getUTCFullYear(), reportingMonth.getUTCMonth() + 1, 0)), checksum: force && duplicate ? `${checksum}:forced:${Date.now()}` : checksum, originalFileName: file.name, storedAssetId: stored.id, actorId, matched, unmatched });
  await prisma.royaltyStatement.update({ where: { id: result.statementId }, data: { reportingMonth } });
  const users = [...new Set(matched.map(row => row.userId))]; await Promise.all(users.map(userId => createNotificationOnce({ eventKey: `royalty-import:${result.statementId}:${userId}`, userId, title: "Latest royalties added", body: "Your dashboard has been updated with the latest royalties.", type: "payout", href: "/royalty-payouts" })));
  return NextResponse.json({ ...result, ...preview, preview: false, confirmed: true });
}

// vercel trigger 14
