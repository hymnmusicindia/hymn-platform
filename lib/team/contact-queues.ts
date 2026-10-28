const closedStages = new Set(['CONVERTED', 'LOST', 'DO_NOT_CONTACT', 'NOT_INTERESTED', 'UNQUALIFIED', 'DUPLICATE']);
type ContactWork = { prospect: { stage: string; verified?: boolean; suppressed?: boolean; contactEligibility?: string; followUpAt?: string | null }; acquisitionEmployeeId?: string | null };

export function needsContactSourceCheck(row: ContactWork) {
  const p = row.prospect;
  return !p.suppressed && !closedStages.has(p.stage) && (!p.verified || !['CONSENTED', 'LEGITIMATE_INTEREST'].includes(p.contactEligibility || ''));
}

export function isContactCallReady(row: ContactWork) {
  const p = row.prospect;
  return !p.suppressed && !closedStages.has(p.stage) && p.verified === true && ['CONSENTED', 'LEGITIMATE_INTEREST'].includes(p.contactEligibility || '') && Boolean(p.followUpAt || row.acquisitionEmployeeId);
}
