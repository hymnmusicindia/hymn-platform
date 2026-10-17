import { providerRequiresCorrections } from "@/lib/direnote-corrections";

/** Extract explicit failures, never infer infringement from ACR matches or an unscanned track. */
export function direNoteQcCorrectionPayload(report: Record<string, unknown>) {
  const tracks = Array.isArray(report.tracks) ? report.tracks : [];
  return { tracks: tracks.map((input: unknown) => {
    const track = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const corrections: string[] = [];
    if (track.scanned === false) return { ...track, corrections };
    for (const [key, label] of [["acr", "Audio check"], ["isrc_lookup", "ISRC check"], ["upc_lookup", "UPC check"]]) {
      const raw = track[key];
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const check = raw as Record<string, unknown>;
      const meaningful = (message: unknown) => typeof message === "string" && message.trim() && !/^(?:none|null|false|ok|success|no (?:errors?|issues?))[.!]?$/i.test(message.trim());
      const errorMessage = (item: unknown) => meaningful(item) || (item && typeof item === "object" && "message" in item && meaningful(item.message));
      const failed = providerRequiresCorrections(check.status) || check.success === false || Boolean(errorMessage(check.error)) || (Array.isArray(check.errors) && check.errors.some(errorMessage));
      if (!failed) continue;
      for (const message of [check.error, check.message, check.reason, check.remarks, ...(Array.isArray(check.errors) ? check.errors : [])]) {
        const text = typeof message === "string" ? message : message && typeof message === "object" && "message" in message ? String(message.message) : "";
        if (meaningful(text) && !/unauthori[sz]ed|credentials?|api[ _-]*(?:key|limit)|timed?\s*out|rate[ _-]*limit|connection|server error|service unavailable/i.test(text)) corrections.push(`${label}: ${text.trim().slice(0, 1000)}`);
      }
    }
    return { ...track, corrections };
  }) };
}
