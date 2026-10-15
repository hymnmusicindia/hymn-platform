import { TeamError } from "./policy";
export function parseTeamCsv(csv: string): Record<string, string>[] {
  if (csv.length > 200000) throw new TeamError("CSV must be under 200 KB.");
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') { if (quoted && csv[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === "," || c === "\n")) { row.push(cell.replace(/\r$/, "")); cell = ""; if (c === "\n") { rows.push(row); row = []; } }
    else cell += c;
  }
  if (quoted) throw new TeamError("CSV contains an unclosed quote.");
  row.push(cell.replace(/\r$/, "")); if (row.some(c => c.trim())) rows.push(row);
  const keys = (rows.shift() || []).map(k => k.replace(/^\uFEFF/, "").trim());
  if (new Set(keys).size !== keys.length || !keys.includes("name") || !keys.includes("sourceUrl") || !keys.includes("evidence")) throw new TeamError("CSV needs unique headers including name, sourceUrl and evidence.");
  if (rows.length > 100) throw new TeamError("Import at most 100 prospects per reviewed batch.");
  return rows.filter(r => r.some(c => c.trim())).map(r => Object.fromEntries(keys.map((k, i) => [k, r[i]?.trim() || ""])));
}
export function teamCsv(headers: string[], rows: Record<string, unknown>[]) {
  const escape = (v: unknown) => '"' + String(v ?? "").replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
  return "\uFEFF" + [headers.map(escape).join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\r\n");
}
