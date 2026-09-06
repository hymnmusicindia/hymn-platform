import { createHash } from "node:crypto";

type Row = Record<string, unknown>;
type LocalTrack = { id: number; title: string; isrc: string | null; trackNumber: number | null };
const value = (input: unknown) => typeof input === "string" ? input.replace(/\s+/g, " ").trim() : "";
const identifier = (input: unknown) => value(input).replace(/[\s-]/g, "").toUpperCase();
const object = (input: unknown): Row => input && typeof input === "object" && !Array.isArray(input) ? input as Row : {};

export function providerRequiresCorrections(input: unknown) {
  return /reject|denied|declin|correction|changes?\s*required|action\s*required|fix\s*required|failed|error|invalid|blocked/.test(value(input).toLowerCase().replace(/[_-]/g, " "));
}

export function matchDireNoteTrack(remote: Row, tracks: LocalTrack[]) {
  const isrc = identifier(remote.isrc);
  const title = value(remote.track_name).toLowerCase();
  const matches = isrc ? tracks.filter(track => identifier(track.isrc) === isrc) : [];
  if (matches.length === 1) return matches[0];
  const titles = title ? tracks.filter(track => value(track.title).toLowerCase() === title) : [];
  if (titles.length === 1) return titles[0];
  // Only use an explicit sequence when no conflicting identity was supplied.
  const sequence = Number(remote.track_number);
  if (!isrc && !title && Number.isInteger(sequence) && sequence > 0) {
    const numbered = tracks.filter(track => track.trackNumber === sequence);
    if (numbered.length === 1) return numbered[0];
  }
  return undefined;
}

export function extractDireNoteCorrections(payload: Row, tracks: LocalTrack[], releaseId: number) {
  const issues: Array<{ field: string; label: string; note: string; fingerprint: string }> = [];
  const ignored = /^(none|n\/?a|null|nil|no(?:ne)?[ .]*|false|true|pending|processing|live|approved|ok|success|isrc generated|release information fetched successfully)[.!]?$/i;
  const action = /\b(?:please\s+(?:select|change|update|fix|correct|provide|upload|remove|replace|check)|must\s+(?:select|change|provide|be)|(?:correction|action|changes?)\s+required|missing|mismatch|invalid|incorrect|rejected|not\s+allowed)\b/i;
  const strongKeys = new Set(["correction", "corrections", "issue", "issues", "rejection_reason", "action_required", "error", "errors"]);
  const reviewKeys = new Set(["remark", "remarks", "review_note", "review_notes", "note", "reason", "action"]);

  function inspect(row: Row, scope: string, label: string, identity: string) {
    const rejected = providerRequiresCorrections(row.status);
    function add(input: unknown, key: string, strong: boolean, depth = 0) {
      if (depth > 4) return;
      if (Array.isArray(input)) { input.slice(0, 30).forEach(item => add(item, key, strong, depth + 1)); return; }
      if (input && typeof input === "object") {
        for (const [nestedKey, nestedValue] of Object.entries(object(input))) {
          if (["message", "text", "description", ...reviewKeys, ...strongKeys].includes(nestedKey)) add(nestedValue, key, strong, depth + 1);
        }
        return;
      }
      const message = value(input).slice(0, 1000);
      if (!message || ignored.test(message) || /\bno (?:issues|corrections|action)\b|\b(?:fetched|generated|submitted) successfully\b/i.test(message)) return;
      if (!strong && !rejected && !action.test(message)) return;
      const fingerprint = createHash("sha256").update(JSON.stringify([releaseId, "direnote", identity, key, message.toLowerCase()])).digest("hex");
      if (issues.some(issue => issue.fingerprint === fingerprint)) return;
      issues.push({ field: `${scope}.providerCorrection.${fingerprint.slice(0, 12)}`, label, note: `DireNote review: ${message}`, fingerprint });
    }
    for (const [key, input] of Object.entries(row)) {
      if (strongKeys.has(key) || reviewKeys.has(key) || (key === "message" && rejected)) add(input, key, strongKeys.has(key));
    }
  }
  inspect(payload, "direnote", "Release · DireNote correction", "release");
  inspect(object(payload.release), "direnote", "Release · DireNote correction", "release");
  const remoteTracks = Array.isArray(payload.tracks) ? payload.tracks : [];
  remoteTracks.forEach((input, index) => {
    const remote = object(input);
    const local = matchDireNoteTrack(remote, tracks);
    const localIndex = local ? tracks.indexOf(local) : -1;
    // HYMN's editor has no unambiguous per-track instrumental field. Keep the
    // provider instruction attached to the track instead of inventing one.
    inspect(remote, local ? `tracks.${localIndex}` : `direnote.remoteTrack.${index}`,
      local ? `Track ${localIndex + 1} · DireNote correction` : `DireNote track ${value(remote.track_name) || index + 1} · Correction`,
      local ? String(local.id) : identifier(remote.isrc) || value(remote.track_name) || `remote:${index}`);
  });
  return issues;
}

export function direNoteCorrectionFingerprint(issues: ReturnType<typeof extractDireNoteCorrections>) {
  return createHash("sha256").update(issues.map(issue => issue.fingerprint).sort().join(":") || "provider-status-requires-corrections").digest("hex");
}
