type Row = Record<string, unknown>;
const identity = (value: unknown) => typeof value === "string" ? value.replace(/[\s-]/g, "").toUpperCase() : "";

/** Status lookup can include historical submissions for the same recording.
 * Only discard history when a valid ISRC and an unambiguous dated revision prove
 * ordering. Never use array order, title alone, or status preference as evidence. */
export function currentDireNoteTracks(rows: Row[]): Row[] {
  const groups = new Map<string, Row[]>();
  rows.forEach((row, index) => {
    const isrc = identity(row.isrc);
    const key = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc) ? isrc : `unidentified:${index}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  return [...groups.values()].flatMap(group => {
    if (group.length === 1) return group;
    const dated = group.map(row => ({ row, date: String(row.date ?? "") }));
    // Provider's documented SQL timestamp has no timezone. Lexical comparison
    // within one response preserves ordering without assuming the server zone.
    if (dated.some(item => !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(item.date))) return group;
    const latest = dated.reduce((a, b) => a.date > b.date ? a : b).date;
    const winners = dated.filter(item => item.date === latest);
    return winners.length === 1 ? [winners[0].row] : group;
  });
}
