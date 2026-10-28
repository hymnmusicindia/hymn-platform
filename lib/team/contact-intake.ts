// One form contract for new cards and edits; the server remains authoritative.
export function contactIntakePayload(form: FormData, actorId: string, selected: { id: string; version: number; ownerId: string } | null, research: boolean) {
  const text = (key: string) => String(form.get(key) || '').trim();
  return {
    ...(selected ? { id: selected.id, version: selected.version } : {}),
    ownerId: selected?.ownerId || actorId,
    name: text('name'), phone: text('phone'), email: text('email'), secondaryEmail: text('secondaryEmail'),
    interests: [...new Set(form.getAll('interests').map(String))], state: text('state'), city: text('city'),
    notes: text('notes'), status: text('status') || 'ACTIVE',
    ...(research && !selected ? { research: { sourceUrl: text('sourceUrl'), evidence: text('evidence'), contactEligibility: text('contactEligibility'), verified: form.has('verified') } } : {}),
  };
}
