"use client";
import { useEffect, useState } from "react";
import { CLIENT_INTERESTS } from "@/lib/team/client-interests";
import styles from "./calendar.module.css";
type Account = { email: string; name: string; avatar: string | null };
type Api = <T>(resource: string, body?: unknown) => Promise<T>;
export function TeamClientFields({ client, api }: { client?: { email: string; secondaryEmail?: string; interests?: string[]; state?: string; city?: string }; api: Api }) {
  const [email, setEmail] = useState(client?.email || ""), [secondary, setSecondary] = useState(client?.secondaryEmail || "");
  const [accounts, setAccounts] = useState<Account[]>([]), [lookup, setLookup] = useState(""), [checked, setChecked] = useState(false);
  useEffect(() => {
    let live = true; setChecked(false); setAccounts([]);
    const emails = [email, secondary].map(v => v.trim()).filter(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
    if (!emails.length) { setLookup(""); return; }
    const timer = setTimeout(async () => { setLookup("Checking HYMN accounts…"); try { const data = await api<{ accounts: Account[] }>(`client-account-match?${new URLSearchParams(emails.map(value => ["email", value]))}`); if (live) { setAccounts(data.accounts); setLookup(""); setChecked(true); } } catch { if (live) setLookup("Account check unavailable. Saving will check again securely."); } }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [email, secondary, api]);
  return <>
    <div className={styles.formColumns}><label>Primary email (optional)<input name="email" type="email" maxLength={320} value={email} onChange={e => setEmail(e.target.value)}/></label><label>Secondary email (optional)<input name="secondaryEmail" type="email" maxLength={320} value={secondary} onChange={e => setSecondary(e.target.value)}/></label></div>
    <div role="status" className={styles.accountMatch}>{lookup}{accounts.map(account => <div key={account.email}><span>✓</span><span><strong>{account.name}</strong><small>{account.email} · Existing HYMN account</small></span></div>)}{checked && !accounts.length && <p>No matching HYMN account. One personalised introduction will be queued to the primary email after saving an active card.</p>}</div>
    <small>Matching does not change login details or grant account access. Secondary email is an alternate contact, not a second mailing recipient.</small>
    <fieldset className={styles.interests}><legend>Interested in (optional)</legend>{Object.entries(CLIENT_INTERESTS).map(([key, label]) => <label key={key}><input type="checkbox" name="interests" value={key} defaultChecked={client?.interests?.includes(key)}/><span>{label}</span></label>)}</fieldset>
    <div className={styles.formColumns}><label>State (optional)<input name="state" maxLength={100} defaultValue={client?.state}/></label><label>City (optional)<input name="city" maxLength={100} defaultValue={client?.city}/></label></div>
    <small>Introductions honour do-not-contact and existing unsubscribe preferences. Saving does not subscribe anyone to the newsletter.</small>
  </>;
}
