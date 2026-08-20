export const DIRENOTE_REQUIRED_COLUMNS = ["reporting_month", "sales_month", "platform", "sales_type", "country", "artist_name", "release_title", "track_title", "upc", "isrc", "currency", "net_revenue"] as const;

export function normalizeHeader(value: string) { return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }

export function parseCsv(text: string) {
  const records: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) { const char = text[i]; if (char === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; } else if (char === "," && !quoted) { row.push(field); field = ""; } else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[i + 1] === "\n") i++; row.push(field); if (row.some(Boolean)) records.push(row); row = []; field = ""; } else field += char; }
  row.push(field); if (row.some(Boolean)) records.push(row); return records;
}

export function parseMonth(value: unknown) { const raw = String(value ?? "").trim(); const match = raw.match(/^(\d{4})[-\/]?(\d{1,2})$/); const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)) : new Date(raw); return Number.isNaN(date.getTime()) ? null : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)); }

// vercel trigger 14
