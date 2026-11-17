import { createHash } from "node:crypto";

type Row = Record<string, unknown>;
type LocalTrack = { id: number; title: string; isrc: string | null; trackNumber: number | null; providerTrackId?: string | null };
const value = (input: unknown) => typeof input === "string" ? input.replace(/\s+/g, " ").trim() : "";
const identifier = (input: unknown) => value(input).replace(/[\s-]/g, "").toUpperCase();
const object = (input: unknown): Row => input && typeof input === "object" && !Array.isArray(input) ? input as Row : {};

export function providerRequiresCorrections(input: unknown) {
  return /reject|denied|declin|correction|changes?\s*required|action\s*required|fix\s*required|failed|error|invalid|blocked/.test(value(input).toLowerCase().replace(/[_-]/g, " "));
}

export function matchDireNoteTrack(remote: Row, tracks: LocalTrack[], strictIdentity = false) {
  const isrc = identifier(remote.isrc);
  const providerId = value(remote.track_id ?? remote.id);
  const providerMatches = providerId ? tracks.filter(track => track.providerTrackId === providerId) : [];
  if (providerMatches.length === 1) return providerMatches[0];
  const title = value(remote.track_name ?? remote.title ?? remote.trackName).toLowerCase();
  const matches = isrc ? tracks.filter(track => identifier(track.isrc) === isrc) : [];
  if (matches.length === 1) return matches[0];
  const titles = title ? tracks.filter(track => value(track.title).toLowerCase() === title) : [];
  if (titles.length === 1) {
    if (strictIdentity && isrc && titles[0].isrc && identifier(titles[0].isrc) !== isrc) return undefined;
    if (strictIdentity && providerId && titles[0].providerTrackId && titles[0].providerTrackId !== providerId) return undefined;
    return titles[0];
  }
  // QC enrichment cannot use a positional guess when identifiers conflict.
  // Legacy status reconciliation separately validates identifier discrepancies.
  const sequence = Number(remote.track_number);
  if ((!strictIdentity || (!isrc && !providerId && !title)) && Number.isInteger(sequence) && sequence > 0) {
    const numbered = tracks.filter(track => track.trackNumber === sequence);
    if (numbered.length === 1) return numbered[0];
  }
  return undefined;
}

export function extractDireNoteCorrections(payload: Row, tracks: LocalTrack[], releaseId: number, attemptId?: number, strictIdentity = false) {
  const issues: Array<{ field: string; label: string; note: string; fingerprint: string }> = [];
  const ignored = /^(none|n\/?a|null|nil|no(?:ne)?[ .]*|false|true|pending|processing|live|approved|ok|success|isrc generated|release information fetched successfully)[.!]?$/i;
  const action = /\b(?:please\s+(?:select|change|update|fix|correct|provide|upload|remove|replace|check)|must\s+(?:select|change|provide|be)|(?:correction|action|changes?)\s+required|missing|mismatch|invalid|incorrect|rejected|not\s+allowed)\b/i;
  const strongKeys = new Set(["correction", "corrections", "issue", "issues", "rejection_reason", "rejection_reasons", "action_required", "error", "errors", "remark", "remarks", "review_note", "review_notes", "review_remarks", "correction_remarks"]);
  const reviewKeys = new Set(["remark", "remarks", "review_note", "review_notes", "note", "reason", "action"]);

  const seenMessages = new Set<string>();

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
      const rawMessage = typeof input === "string" ? input.replace(/\r\n?/g, "\n").trim().slice(0, 20000) : "";
      const message = value(rawMessage);
      if (!message || ignored.test(message) || /^(submitted|accepted|under review|release fetched successfully)[.!]?$/i.test(message) || /\bno (?:issues|corrections|action)\b|\b(?:fetched|generated|submitted) successfully\b/i.test(message)) return;
      if (!strong && !rejected && !action.test(message)) return;
      // A provider can repeat one album decision on every track. Explicit track
      // references take precedence over the row carrying that decision.
      const refs = [...message.matchAll(/\btracks?\s+(\d+)((?:(?:\s*(?:,|&|and)\s*)(?:tracks?\s+)?\d+)*)/gi)];
      const numbers = [...new Set(refs.flatMap(match => (match[1] + match[2]).match(/\d+/g)!.map(Number)))];
      const shared = numbers.length > 0 || scope === "direnote";
      const dedupKey = JSON.stringify([shared ? "release" : identity, message.toLowerCase()]);
      if (seenMessages.has(dedupKey)) return;
      seenMessages.add(dedupKey);
      // Only headings split a multi-track decision. Incidental numbers in prose
      // must never make the whole paragraph an issue on its first named track.
      const headings = [...rawMessage.matchAll(/\btracks?\s+\d+(?:(?:\s*(?:,|&|and)\s*)(?:tracks?\s+)?\d+)*\s*[\u2014\u2013:-]\s*/gi)];
      const sections = headings.length > 1 ? headings.map((heading, index) => rawMessage.slice(heading.index!, headings[index + 1]?.index ?? rawMessage.length).split(/\bRequired Action\b/i)[0].trim()) : [rawMessage];
      for (const section of sections) {
        const sectionRefs = sections.length > 1 ? [...section.matchAll(/\btracks?\s+(\d+)((?:(?:\s*(?:,|&|and)\s*)(?:tracks?\s+)?\d+)*)/gi)] : refs;
        const sectionNumbers = [...new Set(sectionRefs.flatMap(match => (match[1] + match[2]).match(/\d+/g)!.map(Number)))];
        const indices = sectionNumbers.map(number => {
          const matches=tracks.map((track,index)=>({track,index})).filter(({track,index})=>(track.trackNumber ?? index+1)===number);
          return matches.length===1 ? matches[0].index : -1;
        });
        const ambiguousRange = /\btracks?\s+\d+\s*[-\u2013\u2014]\s*\d+/i.test(section);
        // Unknown / ambiguous references stay at release level for manual review.
        const targets = !ambiguousRange && indices.length && indices.every(index => index >= 0) ? indices.map(index => ({ scope: `tracks.${index}`, label: `Track ${tracks[index].trackNumber ?? index + 1} \u00b7 ${tracks[index].title}` })) : [{ scope: shared ? "direnote" : scope, label: shared ? "Release · HYMN correction" : label }];
        const actions = rawMessage.split(/\bRequired Action\b/i)[1]?.split('\n').filter(line => /^\s*[-*]/.test(line) && sectionNumbers.some(number => [...line.matchAll(/\d+/g)].some(match => Number(match[0]) === number))) ?? [];
        const note = section + (actions.length ? '\n\nRequired action\n' + actions.join('\n') : '');
        for (const target of targets) {
          const fingerprint = createHash("sha256").update(JSON.stringify([releaseId, "direnote", attemptId ?? "legacy", target.scope, value(note).toLowerCase()])).digest("hex");
          if (issues.some(issue => issue.fingerprint === fingerprint)) continue;
          const trackLanguage = /^tracks\.\d+$/.test(target.scope) && /\btrack[\s_-]+language\b/i.test(section);
          const rights = /content\s*id|copyright|ownership|exclusive rights?|licen[cs]e|rights clarification/i.test(section);
          let field = trackLanguage ? `${target.scope}.trackLanguage` : rights && target.scope === "direnote" ? "rights.contentId" : `${target.scope}.${rights ? "rights.contentId" : "providerCorrection"}.${fingerprint.slice(0, 12)}`;
          if (issues.some(issue=>issue.field===field)) field += `.${fingerprint.slice(0,12)}`;
          issues.push({field, label: rights && target.scope === "direnote" ? "Rights · Content ID" : `${target.label}${rights ? " · Rights / ownership" : ""}`, note, fingerprint});
        }
      }
    }
    for (const [key, input] of Object.entries(row)) {
      if (strongKeys.has(key) || reviewKeys.has(key) || (key === "message" && rejected)) add(input, key, strongKeys.has(key));
    }
  }
  inspect(payload, "direnote", "Release · HYMN correction", "release");
  inspect(object(payload.release), "direnote", "Release · HYMN correction", "release");
  const remoteTracks = Array.isArray(payload.tracks) ? payload.tracks : Array.isArray(object(payload.release).tracks) ? object(payload.release).tracks as unknown[] : [];
  remoteTracks.forEach((input, index) => {
    const remote = object(input);
    const local = matchDireNoteTrack(remote, tracks, strictIdentity);
    const localIndex = local ? tracks.indexOf(local) : -1;
    inspect(remote, local ? `tracks.${localIndex}` : `direnote.remoteTrack.${index}`,
      local ? `Track ${localIndex + 1} · ${local.title} · HYMN correction` : `HYMN track ${value(remote.track_name) || index + 1} · Correction`,
      local ? String(local.id) : identifier(remote.isrc) || value(remote.track_name) || `remote:${index}`);
  });
  return issues.sort((a,b)=>(Number(a.field.match(/^tracks\.(\d+)\./)?.[1] ?? -1))-(Number(b.field.match(/^tracks\.(\d+)\./)?.[1] ?? -1)));
}

export function direNoteCorrectionFingerprint(issues: ReturnType<typeof extractDireNoteCorrections>) {
  return createHash("sha256").update(issues.map(issue => issue.fingerprint).sort().join(":") || "provider-status-requires-corrections").digest("hex");
}
