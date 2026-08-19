import { createSign } from "crypto";
import { logAuditEvent } from "@/lib/audit-log";

const TABS = {
  royalty: "Royalty Line Items",
  split: "Split Records",
  recipients: "Split Recipients",
  earnings: "Split Earnings",
  wallet: "Wallet Ledger",
  payout: "Payout Requests"
} as const;

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");
export function sheetsConfigured() {
  return process.env.GOOGLE_SHEETS_ENABLED === "true" && Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

async function accessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signer = createSign("RSA-SHA256"); signer.update(`${header}.${payload}`);
  const assertion = `${header}.${payload}.${signer.sign(key, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!response.ok) throw new Error(`Google authentication failed (${response.status}).`);
  return String((await response.json()).access_token);
}

async function append(tab: string, values: unknown[]) {
  if (!sheetsConfigured()) return { synced: false, warning: "Google Sheets sync is not configured." };
  try {
    const token = await accessToken(); const spreadsheet = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheet)}/values/${encodeURIComponent(`${tab}!A:Z`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ values: [values] }) });
    if (!response.ok) throw new Error(`Google Sheets append failed (${response.status}).`);
    return { synced: true };
  } catch (error) {
    await logAuditEvent({ actorType: "system", entityType: "sheet_sync", entityId: tab, action: "sheet.sync_failed", metadata: { message: error instanceof Error ? error.message : "Unknown sync error" } });
    return { synced: false, warning: error instanceof Error ? error.message : "Google Sheets sync failed." };
  }
}

export const syncRoyaltyLineItemToSheet = (row: any) => append(TABS.royalty, [row.id, row.releaseId, row.trackId, row.upc, row.isrc, row.platform, row.territory, row.statementMonth, String(row.grossRevenue), String(row.netRevenue), row.createdAt]);
export const syncSplitRecordToSheet = (row: any) => append(TABS.split, [row.id, row.releaseId, row.trackId, row.ownerUserId, row.status, String(row.totalSharePercent), row.effectiveFromMonth, row.effectiveFromYear, row.createdAt]);
export async function syncSplitEarningLineItemsToSheet(rows: any[]) { return Promise.all(rows.map((row) => append(TABS.earnings, [row.id, row.releaseId, row.trackId, row.royaltyLineItemId, row.recipientName, row.recipientEmail, row.recipientUserId, row.recipientRole, String(row.sharePercent), String(row.netShareAmount), row.currency, row.status, row.createdAt]))); }
export const syncPayoutRequestToSheet = (row: any) => append(TABS.payout, [row.id, row.userId, String(row.amount), String(row.serviceFee), String(row.netAmount), row.currency, row.method, row.status, row.requestedAt, row.requestedAmountUsd == null ? "" : String(row.requestedAmountUsd), row.requestedAmountInr == null ? String(row.amount) : String(row.requestedAmountInr), row.minimumPayoutUsd == null ? "" : String(row.minimumPayoutUsd), row.usdToInrRate == null ? "" : String(row.usdToInrRate), row.exchangeRateProvider ?? "", row.exchangeRateFetchedAt ?? ""]);
export async function pullCalculatedSheetRows() { return { pulled: false, warning: "Sheet pullback is disabled by design; HYMN DB is authoritative." }; }
export async function reconcileSheetWithDatabase() { return { reconciled: false, warning: sheetsConfigured() ? "Use stable row IDs and admin approval for reconciliation." : "Google Sheets sync is not configured." }; }

// vercel trigger 12
