"use client";

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp, X, ArrowRight } from 'lucide-react';
import styles from './assistance.module.css';

type Journey = { title: string; module: string; permission?: string; steps: { selector: string; text: string }[] };
const journeys: Journey[] = [
  { title: 'Write a customer call report', module: 'contacts', permission: 'crm.outreach.manage', steps: [
    { selector: '[data-team-guide="contact-search"]', text: 'Find the customer by name, email or phone. Reports stay on their shared contact card, including calls made from a personal phone.' },
    { selector: '[data-team-guide="call-report-open"]', text: 'Click Call report & history on the correct customer card. This opens their report sheet and all shared reports.' },
    { selector: '[data-team-guide="call-report-time"]', text: 'Enter the actual call date and time in IST, choose the phone source and outcome. Record the discussion, customer needs, agreements and next action, then Save report to contact. Earlier reports remain unchanged.' },
    { selector: '[data-team-guide="call-report-history"]', text: 'Reopen this sheet any time to read shared history. Add update appends a dated report without replacing the original. For scheduled callback completion, use the same sheet from Customer callbacks.' },
  ] },
  { title: 'Find or add a contact', module: 'contacts', steps: [
    { selector: '[data-team-guide="contact-search"]', text: 'Search by name, email or phone first. Open the existing card if this person is already saved.' },
    { selector: '[data-team-guide="contact-add"]', text: 'No match? Click Add contact. Enter their real details, then save once. Matching records will be reviewed before saving.' },
  ] },
  { title: 'Check a source and qualify a contact', module: 'acquisition', permission: 'crm.prospects.create', steps: [
    { selector: '[data-team-guide="research-queue"]', text: 'Choose Source checks to see contacts still waiting for research.' },
    { selector: '[data-team-guide="source-results"] [data-team-guide="lead-card"]', text: 'Open a contact. In Step 1, save the public source, evidence and outreach eligibility. Mark the source checked only after verifying it. This does not mark a verified lead.' },
  ] },
  { title: 'Call a lead and record the result', module: 'acquisition', permission: 'crm.outreach.manage', steps: [
    { selector: '[data-team-guide="call-queue"]', text: 'Choose Call queue to find assigned contacts and follow-ups.' },
    { selector: '[data-team-guide="call-results"] [data-team-guide="lead-card"]', text: 'Open the assigned contact, review their details, then record the real conversation and next call in Step 2. Never mark a call from opening WhatsApp alone.' },
  ] },
  { title: 'Find customer callbacks', module: 'customer-calls', permission: 'crm.outreach.manage', steps: [
    { selector: '[data-team-guide="customer-calls"]', text: 'Customer callbacks are separate from new sales leads. Open your assigned callback to record the outcome or reschedule it.' },
  ] },
  { title: 'Set my working hours', module: 'availability', steps: [
    { selector: '[data-team-guide="availability"]', text: 'Set your recurring shift or this week\'s hours here. Calling access alone does not make you available for assignments.' },
  ] },
];

export function TeamAssistance({ navigate, owner, permissions }: { navigate: (module: string) => void; owner: boolean; permissions: string[] }) {
  const [open, setOpen] = useState(false), [journey, setJourney] = useState<Journey | null>(null), [step, setStep] = useState(0);
  const [modalHost, setModalHost] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLElement>(null);
  const current = journey?.steps[step];
  useEffect(() => {
    if (!open) { setModalHost(null); return; }
    // A native modal makes the rest of the page inert. Keep its active guide
    // in the same top layer so Next/Done remain usable inside report sheets.
    const update = () => { const dialogs = document.querySelectorAll<HTMLElement>('dialog[open]'); setModalHost(dialogs.length ? dialogs[dialogs.length - 1] : null); };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    update(); return () => observer.disconnect();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open, journey, step]);
  useEffect(() => {
    setRect(null);
    if (!open || !current) return;
    let target: HTMLElement | null = null;
    const update = () => {
      const found = document.querySelector<HTMLElement>(current.selector);
      if (!found || !found.getClientRects().length) { setRect(null); return; }
      if (target !== found) { target = found; found.scrollIntoView({ block: 'center', behavior: 'instant' }); }
      const bounds = found.getBoundingClientRect();
      setRect({ top: bounds.top - 5, left: bounds.left - 5, width: bounds.width + 10, height: bounds.height + 10 });
    };
    const observer = new MutationObserver(update); observer.observe(document.querySelector('[data-dashboard-main]') || document.body, { childList: true, subtree: true });
    const resize = new ResizeObserver(update); resize.observe(document.body);
    document.addEventListener('scroll', update, true); window.addEventListener('resize', update); update();
    return () => { observer.disconnect(); resize.disconnect(); document.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [open, current]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const guidance = <>
    {open && rect && <div className={styles.spotlight} style={rect} aria-hidden="true" data-team-highlight/>}
    {open && <aside ref={panel} tabIndex={-1} className={styles.panel} aria-label="Team assistance">
      <header><div><small>HYMN TEAM GUIDE</small><h2>{journey?.title || 'What would you like to do?'}</h2></div><button type="button" aria-label="Close assistance" onClick={close}><X size={18}/></button></header>
      {current ? <><p aria-live="polite">{current.text}</p>{!rect && <p className={styles.hint}>No matching control is visible yet. If this queue is empty, there is nothing to process here. Choose another guide or return when a contact is available.</p>}<footer><button type="button" onClick={() => { setJourney(null); setRect(null); }}>All guides</button><span>{step + 1}/{journey!.steps.length}</span><button type="button" onClick={() => step + 1 < journey!.steps.length ? setStep(step + 1) : close()}>{step + 1 < journey!.steps.length ? 'Next' : 'Done'}<ArrowRight size={14}/></button></footer></>
        : <div className={styles.choices}>{journeys.filter(item => !item.permission || owner || permissions.includes(item.permission)).map(item => <button type="button" key={item.title} onClick={() => { setJourney(item); setStep(0); navigate(item.module); }}>{item.title}<ArrowRight size={15}/></button>)}<p>Guides highlight where to click. You control every edit and save.</p></div>}
    </aside>}
  </>;
  return <>{modalHost ? createPortal(guidance, modalHost) : guidance}<button ref={trigger} type="button" className={styles.launcher} aria-label="Team assistance" aria-expanded={open} onClick={() => { setOpen(value => !value); setJourney(null); }}><CircleHelp size={20}/><span>Assistance</span></button></>;
}
