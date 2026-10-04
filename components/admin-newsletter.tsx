"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download, MailPlus, Megaphone, RotateCcw, Search, Send, Trash2, UsersRound } from "lucide-react";

type Campaign = { id: number; subject: string; status: string; recipientCount: number; sentCount: number; failedCount: number; createdAt: string };
type Subscriber = { id: number; email: string; status: string; source: string; consentAt: string; unsubscribedAt: string | null; createdAt: string };
type AudienceData = { subscribers: Subscriber[]; counts: Record<string, number>; sources: Array<{ source: string; count: number }> };
type SummaryData = { total: number; unsubscribed: number; campaigns: Campaign[]; configured: boolean };
type View = "audience" | "unsubscribed" | "compose";

const templates = {
  blank: { label: "Blank message", subject: "", message: "" },
  platform: { label: "Platform update", subject: "What’s new at HYMN Music", message: "Hi,\n\nWe’ve made HYMN Music better for independent artists and producers. Here’s what’s new:\n\n• Add your update\n• Add the benefit\n• Add the next step\n\nOpen HYMN Music to explore the latest updates.\n\n— The HYMN Music team" },
  opportunity: { label: "Artist opportunity", subject: "A new opportunity from HYMN Music", message: "Hi,\n\nWe have a new opportunity for artists and producers in the HYMN community.\n\nAdd the opportunity details, eligibility, and deadline here.\n\nTake the next step through HYMN Music.\n\n— The HYMN Music team" },
  release: { label: "Release reminder", subject: "Ready to release your music?", message: "Hi,\n\nYour next release can reach listeners across major music platforms through HYMN Music. Prepare your artwork, audio, and credits, then submit everything from one place.\n\nStart when your release is ready.\n\n— The HYMN Music team" }
} as const;

const sourceName = (source: string) => source === "homepage" || source === "website" ? "Website" : source === "instagram" ? "Instagram" : source.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString() : "—";

export function AdminNewsletter() {
  const [view, setView] = useState<View>("audience");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [audience, setAudience] = useState<AudienceData | null>(null);
  const [search, setSearch] = useState(""); const [source, setSource] = useState("all");
  const [newEmails, setNewEmails] = useState(""); const [newSource, setNewSource] = useState("instagram");
  const [subject, setSubject] = useState(""); const [message, setMessage] = useState(""); const [campaignId, setCampaignId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [reviewing, setReviewing] = useState(false);

  const loadSummary = useCallback(() => fetch("/api/admin/newsletter", { cache: "no-store" }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not load newsletter."); setSummary(body); }), []);
  const loadAudience = useCallback(() => {
    const params = new URLSearchParams({ status: view === "unsubscribed" ? "unsubscribed" : "all", ...(search ? { search } : {}), ...(source !== "all" ? { source } : {}) });
    return fetch(`/api/admin/newsletter/subscribers?${params}`, { cache: "no-store" }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not load subscribers."); setAudience(body); });
  }, [search, source, view]);

  useEffect(() => { void Promise.all([loadSummary(), loadAudience()]).catch(error => setFeedback(error instanceof Error ? error.message : "Could not load newsletter.")); }, [loadAudience, loadSummary]);
  const activeSubscribers = useMemo(() => audience?.subscribers.filter(item => item.status === "subscribed") ?? [], [audience]);

  async function addSubscribers() {
    const emails = [...new Set(newEmails.split(/[\s,;]+/).map(item => item.trim()).filter(Boolean))];
    if (!emails.length) return setFeedback("Enter at least one email address.");
    setBusy(true); setFeedback(null);
    try {
      const response = await fetch("/api/admin/newsletter/subscribers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails, source: newSource }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not add subscribers.");
      setNewEmails(""); setFeedback(`${body.added} address${body.added === 1 ? "" : "es"} added.${body.suppressed?.length ? ` ${body.suppressed.length} opted-out address${body.suppressed.length === 1 ? " was" : "es were"} kept suppressed.` : ""}`);
      await Promise.all([loadSummary(), loadAudience()]);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Could not add subscribers."); } finally { setBusy(false); }
  }

  async function updateSubscriber(id: number, action: "remove" | "restore") {
    if (action === "remove" && !window.confirm("Remove this address from future newsletter campaigns?")) return;
    setBusy(true); setFeedback(null);
    try { const response = await fetch("/api/admin/newsletter/subscribers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not update subscriber."); setFeedback(action === "remove" ? "Address removed from future campaigns." : "Address restored."); await Promise.all([loadSummary(), loadAudience()]); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Could not update subscriber."); } finally { setBusy(false); }
  }

  async function copyList() { const response = await fetch("/api/admin/newsletter?format=text"); const text = await response.text(); await navigator.clipboard.writeText(text); setFeedback(`${summary?.total || 0} active emails copied.`); }
  async function sendCampaign() {
    setBusy(true); setFeedback(null);
    try { const response = await fetch("/api/admin/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, message, ...(campaignId ? { campaignId } : {}) }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not send this batch."); setCampaignId(body.campaign.id); setReviewing(false); setFeedback(body.complete ? `Campaign complete: ${body.campaign.sentCount} sent, ${body.campaign.failedCount} failed.` : `${body.processed} processed. ${body.remaining} recipients remain; send the next batch when ready.`); await loadSummary(); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Could not send this batch."); } finally { setBusy(false); }
  }

  function chooseTemplate(key: keyof typeof templates) { const template = templates[key]; setSubject(template.subject); setMessage(template.message); setCampaignId(null); setReviewing(false); }

  return <section className="newsletter-admin-shell">
    <header className="newsletter-admin-hero"><div><p className="newsletter-admin-eyebrow">Audience operations</p><h1>Newsletter studio</h1><p>Manage sources, protect opt-outs, and send controlled campaigns from one place.</p></div><span className={`newsletter-ready ${summary?.configured ? "is-ready" : ""}`}><span />{summary?.configured ? "Email ready" : "Email unavailable"}</span></header>
    <div className="newsletter-stat-grid"><button type="button" onClick={() => setView("audience")}><UsersRound /><span>Active audience</span><strong>{summary?.total ?? "—"}</strong></button><button type="button" onClick={() => setView("unsubscribed")}><AlertTriangle /><span>Unsubscribed</span><strong>{summary?.unsubscribed ?? "—"}</strong></button><button type="button" onClick={() => setView("compose")}><Megaphone /><span>Campaigns</span><strong>{summary?.campaigns.length ?? "—"}</strong></button></div>
    <nav className="newsletter-tabs" aria-label="Newsletter sections">{(["audience", "unsubscribed", "compose"] as View[]).map(item => <button key={item} type="button" aria-current={view === item ? "page" : undefined} onClick={() => { setView(item); setFeedback(null); }}>{item === "audience" ? "Audience" : item === "unsubscribed" ? "Opt-out activity" : "Compose"}</button>)}</nav>
    {feedback ? <p className="newsletter-feedback" aria-live="polite">{feedback}</p> : null}

    {view === "audience" ? <div className="newsletter-workspace">
      <aside className="newsletter-add-panel"><div className="newsletter-panel-icon"><MailPlus /></div><h2>Add contacts</h2><p>Paste one or many addresses. Commas, spaces, and new lines are accepted.</p><textarea className="field" value={newEmails} onChange={event => setNewEmails(event.target.value)} placeholder="artist@example.com&#10;producer@example.com" /><label>Source<select className="field" value={newSource} onChange={event => setNewSource(event.target.value)}><option value="instagram">Instagram</option><option value="website">Website</option><option value="event">Event</option><option value="admin">Admin import</option></select></label><button type="button" className="btn-primary" disabled={busy} onClick={addSubscribers}>{busy ? "Adding…" : "Add to audience"}</button><small>Previously unsubscribed addresses remain suppressed.</small></aside>
      <div className="newsletter-list-panel"><div className="newsletter-list-head"><div><h2>All contacts</h2><p>{activeSubscribers.length} active records shown</p></div><div className="newsletter-export-actions"><button type="button" onClick={copyList}><Copy />Copy</button><a href="/api/admin/newsletter?format=csv"><Download />CSV</a></div></div><div className="newsletter-filters"><label><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search email" /></label><select value={source} onChange={event => setSource(event.target.value)}><option value="all">All sources</option>{audience?.sources.map(item => <option value={item.source} key={item.source}>{sourceName(item.source)} · {item.count}</option>)}</select></div><div className="newsletter-table-wrap"><table><thead><tr><th>Email</th><th>Source</th><th>Status</th><th>Added</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{audience?.subscribers.map(item => <tr key={item.id}><td>{item.email}</td><td><span className={`newsletter-source source-${item.source}`}>{sourceName(item.source)}</span></td><td><span className={`newsletter-status is-${item.status}`}>{item.status}</span></td><td>{dateTime(item.createdAt)}</td><td>{item.status === "removed" ? <button type="button" disabled={busy} onClick={() => updateSubscriber(item.id, "restore")} aria-label={`Restore ${item.email}`}><RotateCcw /></button> : item.status === "subscribed" ? <button type="button" disabled={busy} onClick={() => updateSubscriber(item.id, "remove")} aria-label={`Remove ${item.email}`}><Trash2 /></button> : null}</td></tr>)}</tbody></table>{!audience?.subscribers.length ? <div className="newsletter-empty">No contacts match these filters.</div> : null}</div></div>
    </div> : null}

    {view === "unsubscribed" ? <div className="newsletter-optout-panel"><div className="newsletter-list-head"><div><h2>Opt-out activity</h2><p>These addresses are excluded from every future campaign.</p></div><span className="newsletter-alert-count"><AlertTriangle />{audience?.counts.unsubscribed || 0} protected</span></div><div className="newsletter-optout-list">{audience?.subscribers.map(item => <article key={item.id}><span className="newsletter-optout-mark"><CheckCircle2 /></span><div><strong>{item.email}</strong><p>Unsubscribed from {sourceName(item.source)}</p></div><time>{dateTime(item.unsubscribedAt)}</time></article>)}{!audience?.subscribers.length ? <div className="newsletter-empty">No one has unsubscribed yet.</div> : null}</div></div> : null}

    {view === "compose" ? <div className="newsletter-compose-grid"><div className="newsletter-composer"><div className="newsletter-list-head"><div><h2>Compose campaign</h2><p>Every message includes a personal unsubscribe link.</p></div><span>{summary?.total || 0} recipients</span></div><label>Starting point<select className="field" defaultValue="blank" onChange={event => chooseTemplate(event.target.value as keyof typeof templates)}>{Object.entries(templates).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label><label>Subject<input className="field" maxLength={180} value={subject} onChange={event => { setSubject(event.target.value); setCampaignId(null); setReviewing(false); }} placeholder="A clear reason to open this email" /></label><label>Message<textarea className="field" maxLength={20000} value={message} onChange={event => { setMessage(event.target.value); setCampaignId(null); setReviewing(false); }} placeholder="Write your message…" /></label><div className="newsletter-send-row"><button type="button" className="btn-outline" disabled={!subject.trim() || !message.trim()} onClick={() => setReviewing(true)}>Review message</button>{reviewing ? <button type="button" className="btn-primary" disabled={busy || !summary?.configured} onClick={sendCampaign}><Send />{busy ? "Sending…" : campaignId ? "Send next batch" : "Send first batch"}</button> : null}{campaignId ? <span>Campaign #{campaignId}</span> : null}</div></div><aside className="newsletter-preview"><p>Inbox preview</p><div><span>HYMN MUSIC</span><small>Newsletter · to your audience</small><h3>{subject || "Your subject appears here"}</h3><div className="newsletter-preview-copy">{message ? message.split(/\r?\n/).map((line, index) => line ? <p key={index}>{line}</p> : <br key={index} />) : <p>Your message preview appears here.</p>}</div><footer>You received this because you joined HYMN Music updates. <u>Unsubscribe</u></footer></div></aside></div> : null}

    <section className="newsletter-campaign-history"><h2>Recent campaigns</h2><div>{summary?.campaigns.map(campaign => <article key={campaign.id}><div><strong>{campaign.subject}</strong><small>{dateTime(campaign.createdAt)}</small></div><span>{campaign.status}</span><p>{campaign.sentCount}/{campaign.recipientCount} sent{campaign.failedCount ? ` · ${campaign.failedCount} failed` : ""}</p></article>)}{!summary?.campaigns.length ? <div className="newsletter-empty">No campaigns sent yet.</div> : null}</div></section>
  </section>;
}
