"use client";

import { useState } from "react";
import { manualEmailSchema, savedManualEmailSchema, type ManualEmailDraft, type ManualEmailBlock } from "@/lib/manual-email";

const draftKey = "hymn-admin-manual-email-draft-v1";
const blank = (): ManualEmailDraft => ({ requestId: crypto.randomUUID(), to: "", subject: "", title: "", greeting: "Hi there,", blocks: [{ type: "paragraph", text: "" }] });
export function AdminManualEmail({ configured }: { configured: boolean }) {
  const [draft, setDraft] = useState<ManualEmailDraft | null>(null);
  const [html, setHtml] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  function change(next: ManualEmailDraft) { setDraft({ ...next, requestId: crypto.randomUUID() }); setHtml(""); setSent(false); setMessage(""); }
  function updateBlock(index: number, block: ManualEmailBlock) {
    if (draft) change({ ...draft, blocks: draft.blocks.map((b, i) => i === index ? block : b) });
  }
  function preset() {
    change({ ...blank(), subject: "Your release has been delivered and is under review", title: "Your release is now under review", greeting: "Hi [name],", blocks: [
      { type: "paragraph", text: "[Release title] has been successfully delivered to our distribution partner and is now under review. You can follow its progress in your HYMN account." },
      { type: "notice", text: "Release: [release title]\nUPC: [album UPC]\nStatus: Under review\nYour release is not live in stores yet." },
      { type: "button", label: "View your release", url: window.location.origin + "/dashboard/releases" },
      { type: "paragraph", text: "We will notify you when the review status changes. If you have any questions, reply to this email and the HYMN team will help." }
    ] });
  }
  async function request(action: "preview" | "send") {
    const parsed = manualEmailSchema.safeParse(draft);
    if (!parsed.success) { setMessage(parsed.error.issues.map(i => i.message).join(" ")); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/manual-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, draft: parsed.data }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Email could not be completed.");
      if (action === "preview") setHtml(result.html);
      else { setSent(true); setMessage(result.status === "sent" ? "Email sent successfully." : "This draft was already submitted. Check its delivery in Email logs."); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Email could not be completed."); }
    finally { setBusy(false); }
  }
  function load() {
    try {
      const value = localStorage.getItem(draftKey);
      if (!value) { setMessage("No saved draft on this browser."); return; }
      const parsed = savedManualEmailSchema.safeParse(JSON.parse(value));
      if (!parsed.success) throw Error();
      setDraft(parsed.data); setHtml(""); setSent(false); setMessage("Draft loaded. Preview it before sending.");
    } catch { setMessage("Saved draft could not be loaded."); }
  }
  return <section className="rounded-2xl border p-5" style={{ borderColor: "var(--border)" }}>
    <h2 className="text-2xl font-semibold">Compose a branded email</h2>
    <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>The HYMN logo header, white message card and support footer match our catalogue emails. Add buttons anywhere in the message.</p>
    <div className="my-4 flex flex-wrap gap-2"><button className="btn-outline" disabled={busy} onClick={() => change(blank())}>Blank message</button><button className="btn-outline" disabled={busy} onClick={preset}>Release under review</button><button className="btn-outline" disabled={busy} onClick={load}>Load saved draft</button></div>
    {draft ? <div className="grid gap-6 lg:grid-cols-2"><fieldset disabled={busy} className="grid min-w-0 gap-3">
      <label>Recipient<input className="field" type="email" value={draft.to} onChange={e => change({ ...draft, to: e.target.value })}/></label>
      <label>Subject<input className="field" maxLength={180} value={draft.subject} onChange={e => change({ ...draft, subject: e.target.value })}/></label>
      <label>Heading<input className="field" maxLength={200} value={draft.title} onChange={e => change({ ...draft, title: e.target.value })}/></label>
      <label>Greeting<input className="field" value={draft.greeting} onChange={e => change({ ...draft, greeting: e.target.value })}/></label>
      {draft.blocks.map((block, index) => <div key={index} className="grid gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-center gap-2"><strong className="mr-auto text-sm">{index + 1}. {block.type === "notice" ? "Information box" : block.type}</strong><button type="button" className="btn-outline" disabled={index === 0} onClick={() => { const blocks = [...draft.blocks]; [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]]; change({ ...draft, blocks }); }}>Move up</button><button type="button" className="btn-outline" disabled={index === draft.blocks.length - 1} onClick={() => { const blocks = [...draft.blocks]; [blocks[index], blocks[index + 1]] = [blocks[index + 1], blocks[index]]; change({ ...draft, blocks }); }}>Move down</button><button type="button" className="btn-outline" onClick={() => change({ ...draft, blocks: draft.blocks.filter((_, i) => i !== index) })}>Remove</button></div>
        {block.type === "button" ? <><label>Button label<input className="field" maxLength={80} value={block.label} onChange={e => updateBlock(index, { ...block, label: e.target.value })}/></label><label>Button link<input className="field" type="url" placeholder="https://" value={block.url} onChange={e => updateBlock(index, { ...block, url: e.target.value })}/></label></> : <label>{block.type === "notice" ? "Information" : "Message"}<textarea className="field min-h-28" value={block.text} onChange={e => updateBlock(index, { ...block, text: e.target.value })}/></label>}
      </div>)}
      <div className="flex flex-wrap gap-2">{(["paragraph", "notice", "button"] as const).map(type => <button type="button" className="btn-outline" key={type} disabled={draft.blocks.length >= 30} onClick={() => change({ ...draft, blocks: [...draft.blocks, type === "button" ? { type, label: "Open in HYMN", url: window.location.origin + "/dashboard" } : { type, text: "" }] })}>Add {type === "notice" ? "information box" : type}</button>)}</div>
      <div className="flex flex-wrap gap-2"><button className="btn-outline" onClick={() => { try { localStorage.setItem(draftKey, JSON.stringify(draft)); setMessage("Draft saved on this browser."); } catch { setMessage("Browser storage is unavailable."); } }}>Save draft</button><button className="btn-outline" onClick={() => void request("preview")}>Preview email</button><button className="btn-primary" disabled={!html || !configured || sent} onClick={() => void request("send")}>{busy ? "Working…" : sent ? "Sent" : "Send email"}</button></div>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Drafts are stored on this browser. Preview again after changing content. This composer is for account and release messages; use Newsletter for subscriber campaigns.</p>
    </fieldset><aside className="min-w-0"><h3 className="mb-3 font-semibold">Email preview</h3>{html ? <iframe title="Branded email preview" sandbox="" srcDoc={html} className="h-[780px] w-full rounded-xl border bg-white"/> : <p className="text-sm" style={{ color: "var(--text-muted)" }}>Complete the message and select Preview email.</p>}</aside></div> : null}
    {message ? <p role="status" className="mt-4 text-sm">{message}</p> : null}
  </section>;
}
