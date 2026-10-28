"use client";
import { TeamClientFields } from './client-fields';
import styles from './calendar.module.css';

type Contact = { name: string; phone: string; email: string; secondaryEmail: string; interests: string[]; state: string; city: string; notes: string; notesVisible: boolean; status: string; alternatePhones?: string[]; additionalEmails?: string[] };
type Api = <T>(resource: string, body?: unknown) => Promise<T>;
export function ContactIntakeFields({ selected, api, canResearch, research, setResearch }: { selected: Contact | null; api: Api; canResearch: boolean; research: boolean; setResearch: (value: boolean) => void }) {
  return <>
    <fieldset><legend>1. Contact details</legend><p>Use the person's real name and at least one way to reach them. Search existing contacts before creating another card.</p>
      <label>Name<input name="name" defaultValue={selected?.name} required maxLength={160}/></label>
      <label>Phone with country code<input name="phone" type="tel" defaultValue={selected?.phone} maxLength={40} placeholder="+91..."/></label>
      <TeamClientFields client={selected || undefined} api={api}/>
      {!!(selected?.alternatePhones?.length || selected?.additionalEmails?.length) && <p>Other saved details: {[...(selected?.alternatePhones || []), ...(selected?.additionalEmails || [])].join(' / ')}</p>}
    </fieldset>
    {canResearch && !selected && <fieldset><legend>2. Source check</legend><p>Have you checked where this contact came from?</p>
      <label className={styles.inlineCheck}><input type="checkbox" checked={research} onChange={event => setResearch(event.target.checked)}/>Add source evidence now</label>
      <small>{research ? 'Save the evidence below. Only checked, eligible contacts can be handed to a caller.' : 'You can save now and finish the source check in Contacts & calls > Source checks. Saving alone does not verify a lead.'}</small>
      {research && <><label>Public source URL<input name="sourceUrl" type="url" required/></label><label>Source evidence<textarea name="evidence" required minLength={10} maxLength={10000}/></label><label>Outreach eligibility<select name="contactEligibility" defaultValue="UNVERIFIED"><option value="UNVERIFIED">Not verified</option><option value="LEGITIMATE_INTEREST">Relevant professional contact</option><option value="CONSENTED">Contact consent recorded</option><option value="DO_NOT_CONTACT">Do not contact</option></select></label><label className={styles.inlineCheck}><input type="checkbox" name="verified"/>I checked the source and contact details (not a verified lead yet)</label></>}
    </fieldset>}
    <fieldset><legend>{canResearch && !selected ? '3' : '2'}. Notes & contact preferences</legend>
      <label>Contact status<select name="status" defaultValue={selected?.status || 'ACTIVE'}><option value="ACTIVE">Active</option><option value="DO_NOT_CONTACT">Do not contact</option><option value="ARCHIVED">Archived</option></select></label>
      {!selected || selected.notesVisible ? <label>Private notes<textarea name="notes" defaultValue={selected?.notes} maxLength={10000}/><small>Visible to the responsible teammate and authorised managers.</small></label> : <p>Private notes are restricted to the responsible teammate and authorised managers.</p>}
      <small>Saving an active contact with a new email may queue one introduction. Choose Do not contact when outreach is not allowed.</small>
    </fieldset>
  </>;
}
