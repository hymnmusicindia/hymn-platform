import { createHash } from 'node:crypto';
import { contactPhoneKey } from './contact-directory';
type Contact = { email: string | null; phone: string; verified: boolean; suppressed: boolean; contactEligibility: string };
export const leadIdentity = (p: Pick<Contact, 'email' | 'phone'>) => createHash('sha256').update(JSON.stringify([p.email?.trim().toLowerCase() || '', contactPhoneKey(p.phone)])).digest('hex');
export function hasLeadVerification(p: Contact, proof?: { evidence: string } | null) {
  return Boolean(p.verified && !p.suppressed && ['CONSENTED', 'LEGITIMATE_INTEREST'].includes(p.contactEligibility) && proof?.evidence === leadIdentity(p));
}
