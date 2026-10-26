"use client";
import {displayDateTime} from "@/lib/display-date-time";

import { ArrowUpRight, Check } from "lucide-react";
import { customerMessage } from "@/lib/customer-message";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Release } from "@/lib/types";
type Data = {
    created: any[];
    received: any[];
    requests: any[];
    earnings: any[];
};
const tabs = ["overview", "requests", "join", "created", "shared", "earnings", "payout-details"] as const;
const roles = ["Primary Artist", "Featured Artist", "Producer", "Songwriter", "Composer", "Label", "Manager", "Other"];
const money = (value: unknown) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
async function api(url: string, body?: unknown) {
    const response = await fetch(url, { cache: "no-store", ...(body !== undefined ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok)
        throw new Error(data.error || "Could not complete this request.");
    return data;
}
export function SplitsDashboard({ releases }: {
    releases: Release[];
}) {
    const [tab, setTab] = useState<typeof tabs[number]>("overview");
    const [data, setData] = useState<Data>({ created: [], received: [], requests: [], earnings: [] });
    const [feedback, setFeedback] = useState("");
    const [failed, setFailed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState<any>(null);
    const [code, setCode] = useState("");
    const [credential, setCredential] = useState<any>(null);
    const [releaseId, setReleaseId] = useState("");
    const [trackId, setTrackId] = useState("");
    const [query, setQuery] = useState("");
    const [artist, setArtist] = useState<any>(null);
    const [searchedQuery, setSearchedQuery] = useState("");
    const [method, setMethod] = useState("registered_email");
    const [consent, setConsent] = useState<number | null>(null);
    const [managing, setManaging] = useState<number | null>(null);
    const [period, setPeriod] = useState("");
    const load = useCallback(async () => { try {
        const [splits, payout] = await Promise.all([api("/api/splits"), api("/api/payout/credentials")]);
        setData(splits);
        setCredential(payout.credential);
        setFailed(false);
    }
    catch (e) {
        setFailed(true);
        setFeedback(e instanceof Error ? e.message : "Could not load your splits.");
    }
    finally {
        setLoading(false);
    } }, []);
    useEffect(() => { void load(); const params = new URLSearchParams(window.location.search); const requested = params.get("splitView") || params.get("tab"); if (tabs.includes(requested as any))
        setTab(requested as any); }, [load]);
    async function run(action: () => Promise<void>) { setBusy(true); setFeedback(""); try {
        await action();
    }
    catch (e) {
        setFeedback(e instanceof Error ? e.message : "Connection interrupted. Please try again.");
    }
    finally {
        setBusy(false);
    } }
    async function respond(id: number, action: "accept" | "decline" | "revoke") { await run(async () => { await api(`/api/splits/invites/${id}/${action}`, { code: preview?.id === id ? code : undefined }); setFeedback(action === "accept" ? "Your share is accepted. Earnings begin when the full agreement is active." : action === "decline" ? "Invitation declined." : "Invitation withdrawn. Its percentage is available again."); setPreview(null); setConsent(null); await load(); }); }
    async function search() { await run(async () => { setArtist(null); const result = await api(`/api/splits/recipients?q=${encodeURIComponent(query.trim())}`); setArtist(result.artist); setSearchedQuery(query.trim()); if (!result.artist)
        setFeedback("No active account found. Check their full email or unique handle."); }); }
    async function createInvite(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        await run(async () => {
            if (method === "registered_email" && (!artist || searchedQuery !== query.trim()))
                throw new Error("Find and confirm the recipient before sending.");
            const { split } = await api("/api/splits", { releaseId: Number(releaseId), trackId: trackId ? Number(trackId) : null });
            const { invite } = await api("/api/splits/invites", { splitRecordId: split.id, method, recipientHandle: artist?.tag, recipientName: values.get("recipientName"), role: values.get("role"), sharePercent: Number(values.get("sharePercent")), payoutEligible: true, note: values.get("note") });
            setFeedback(invite.splitCode ? `Private code: ${invite.splitCode}. Expires in 10 hours; share it only with the intended artist.` : invite.deliveryStatus === "not_needed" ? "Your owner share is saved and accepted." : invite.deliveryStatus === "sent" ? "Invitation sent by notification and email." : "Invitation saved and the artist notified in-app. Email delivery is pending or unavailable; its delivery status is logged for support.");
            form.reset();
            setArtist(null);
            setQuery("");
            await load();
        });
    }
    async function manage(record: any, action: "cancel" | "amend") { await run(async () => { await api(`/api/splits/agreements/${record.id}`, { action, effectivePeriod: period }); setManaging(null); setFeedback(action === "amend" ? "Future agreement created. Invite every artist again to collect fresh consent." : "Agreement cancelled. All affected artists were notified in-app."); await load(); }); }
    async function join(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setPreview(null); setConsent(null); await run(async () => { const result = await api("/api/splits/invites/join-code", { code }); setPreview(result.preview); }); }
    async function saveCredential(values: Record<string, string>) { try {
        const result = await api("/api/payout/credentials", values);
        setCredential(result.credential);
        setFeedback("Payout profile submitted for review.");
        return true;
    }
    catch (e) {
        setFeedback(e instanceof Error ? e.message : "Could not submit payout details.");
        return false;
    } }
    const totalEarned = data.earnings.filter(row => row.status === "credited").reduce((sum, row) => sum + Number(row.netShareAmount), 0);
    const held = data.earnings.filter(row => ["held", "pending_payout_details"].includes(row.status)).reduce((sum, row) => sum + Number(row.netShareAmount), 0);
    const selectedRecord = data.created.find(r => r.releaseId === Number(releaseId) && (r.trackId ?? null) === (trackId ? Number(trackId) : null) && r.status !== "archived");
    const selectedRelease = releases.find(r => r.id === Number(releaseId));
    const labels: Record<string, string> = { overview: "Overview", requests: "Invitations", join: "Join with code", created: "My agreements", shared: "Shared with me", earnings: "Earnings", "payout-details": "Payout profile" };
    function invitation(row: any, isCode = false) { return <Card key={row.id} title={isCode ? row.releaseName : row.release.title} status="Awaiting your response"><div className="split-offer"><strong>{Number(row.sharePercent)}<small>%</small></strong><div><p>{row.role}</p><p>Invited by {isCode ? row.ownerName : row.splitRecord.owner.name}</p></div></div>{row.note ? <p>{row.note}</p> : null}<p className="split-hint">This is your share of the artist royalty pool after HYMN fees. Accept only if the role and percentage match your agreement.</p><label className="split-consent"><input type="checkbox" checked={consent === row.id} onChange={e => setConsent(e.target.checked ? row.id : null)}/>I agree to this role and royalty share.</label><div className="split-actions"><button disabled={busy || consent !== row.id} className="btn-primary" onClick={() => void respond(row.id, "accept")}>Accept {Number(row.sharePercent)}% share</button><button disabled={busy} className="btn-outline" onClick={() => void respond(row.id, "decline")}>Decline</button></div></Card>; }
    return <div className="splits-workspace">
    <header className="split-heading"><div><p className="split-eyebrow">CREATE TOGETHER. EARN TOGETHER.</p><h2>Every contribution.<br />A clear share.</h2><p>Agree on royalties, invite your collaborators, and track your earnings in one place.</p></div><button className="btn-primary" onClick={() => setTab("created")}>Create an agreement <ArrowUpRight aria-hidden size={17}/></button></header>
    <nav className="split-navigation" aria-label="Royalty split views">{tabs.map(item => <button key={item} aria-current={tab === item ? "page" : undefined} onClick={() => { setTab(item); setConsent(null); }}>{labels[item]}{item === "requests" && data.requests.length ? <span>{data.requests.length}</span> : null}</button>)}</nav>
    {feedback ? <div className="split-feedback" role="status">{customerMessage(feedback)}{failed ? <button onClick={() => void load()}>Retry loading</button> : null}</div> : null}
    {loading ? <p role="status" className="split-empty">Loading your agreements...</p> : failed ? null : <>
    {tab === "overview" ? <><div className="split-metrics"><Metric label="Invitations to review" value={data.requests.length}/><Metric label="Your agreements" value={data.created.length}/><Metric label="Credited earnings" value={money(totalEarned)}/><Metric label="Awaiting payout verification" value={money(held)}/></div><div className="split-explainer"><div><span>01</span><h3>Build your agreement</h3><p>Assign every share, including your own. Payout shares must total exactly 100%.</p></div><div><span>02</span><h3>Get everyone on board</h3><p>Find an artist by email or @name#1234. Every collaborator reviews and accepts their share.</p></div><div><span>03</span><h3>Follow the earnings</h3><p>Active agreements apply to new imported statements. Verified payout profiles unlock balances.</p></div></div><div className="split-actions"><button className="btn-outline" onClick={() => setTab("requests")}>Review invitations</button><button className="btn-outline" onClick={() => setTab("payout-details")}>Manage payout profile</button></div></> : null}
    {tab === "requests" ? <List empty="You're all caught up. New invitations will appear here and in your notifications.">{data.requests.map(row => invitation(row))}</List> : null}
    {tab === "join" ? <div className="split-columns"><form onSubmit={join} className="split-composer"><p className="split-eyebrow">PRIVATE INVITATION</p><h3>Have a split code?</h3><p className="split-hint">Preview the release and terms before accepting. Codes are single use and expire after 10 hours.</p><label>Invitation code<input name="code" required maxLength={11} className="field uppercase" value={code} onChange={e => { setCode(e.target.value); setPreview(null); }} placeholder="HYMN-8F3K2Q"/></label><button disabled={busy} className="btn-primary">Review invitation</button></form>{preview ? invitation(preview, true) : null}</div> : null}
    {tab === "created" ? <div className="split-columns"><form onSubmit={createInvite} className="split-composer"><p className="split-eyebrow">YOUR NEXT COLLABORATION</p><h3>Invite an artist</h3><label>Release<select aria-label="Release" required className="field" value={releaseId} onChange={e => { setReleaseId(e.target.value); setTrackId(""); }}><option value="">Choose your release</option>{releases.map(r => <option key={r.id} value={r.id}>{r.releaseTitle || r.trackName}</option>)}</select></label><label>Agreement scope<select aria-label="Agreement scope" className="field" value={trackId} onChange={e => setTrackId(e.target.value)}><option value="">Whole release</option>{(selectedRelease as any)?.tracks?.map((t: any) => <option key={t.id} value={t.id}>{t.title || t.trackName}</option>)}</select></label>{selectedRecord ? <p className="split-hint">{Number(selectedRecord.totalSharePercent)}% allocated | {Math.max(0, 100 - Number(selectedRecord.totalSharePercent))}% available | {selectedRecord.status.replaceAll("_", " ")}</p> : null}<label>Invitation method<select aria-label="Invitation method" className="field" value={method} onChange={e => { setMethod(e.target.value); setArtist(null); }}><option value="registered_email">Find a HYMN artist</option><option value="split_code">Generate a private code</option></select></label>{method === "registered_email" ? <><label>Email or unique handle<div className="split-search"><input className="field" aria-label="Email or unique handle" required value={query} maxLength={254} onChange={e => { setQuery(e.target.value); setArtist(null); }} placeholder="artist@email.com or @artist#1234"/><button type="button" disabled={busy || !query.trim()} onClick={() => void search()} className="btn-outline">Find</button></div></label>{artist ? <div className="split-artist"><Check aria-hidden size={16}/><div><strong>{artist.name}</strong><p>{artist.tag}</p></div></div> : <p className="split-hint">Search your own email to include your owner share. Names alone cannot identify an account.</p>}</> : <label>Collaborator's name<input name="recipientName" className="field" required maxLength={100}/></label>}<div className="split-fields"><label>Role<select name="role" className="field">{roles.map(role => <option key={role}>{role}</option>)}</select></label><label>Royalty share (%)<input name="sharePercent" type="number" min="0.01" max="100" step="0.01" required className="field" placeholder="25.00"/></label></div><label>Message <span className="split-hint">Optional</span><textarea name="note" maxLength={2000} className="field" placeholder="Explain the contribution or agreed terms."/></label><p className="split-hint">Your own share is accepted automatically. Other artists must consent. Agreements lock when earnings are first allocated. You can create a future amendment with fresh consent.</p><button disabled={busy || !releaseId || method === "registered_email" && !artist || ["locked", "archived"].includes(selectedRecord?.status)} className="btn-primary">{busy ? "Saving..." : method === "split_code" ? "Generate private code" : "Send split invitation"}</button></form><List empty="No agreements yet. Start with a release and add your first collaborator.">{data.created.map(record => <Card key={record.id} title={record.release.title} status={record.status.replaceAll("_", " ")}><p>{record.track?.title || "Whole release"} | Agreement #{record.id}</p><div className="split-allocation" aria-label={`${Number(record.totalSharePercent)}% allocated`}><span style={{ width: `${Math.min(100, Number(record.totalSharePercent))}%` }}/></div><p>{Number(record.totalSharePercent)}% allocated | {Math.max(0, 100 - Number(record.totalSharePercent))}% unassigned</p><p className="split-hint">{record.status === "locked" ? "Locked to protect earnings already allocated." : record.status === "active" ? "Fully allocated and accepted. Ready for new royalty statements." : "All payout shares must total 100% and every invitation must be accepted."}</p>{record.effectiveFromYear ? <p className="split-hint">Effective from {record.effectiveFromYear}-{String(record.effectiveFromMonth).padStart(2, "0")}</p> : null}{record.status !== "archived" ? <div className="split-actions">{managing === record.id ? <div className="grid gap-3">{record.status === "locked" ? <label>First statement month<input className="field" type="month" required value={period} onChange={e => setPeriod(e.target.value)}/></label> : null}<p className="split-hint">{record.status === "locked" ? "The existing agreement remains valid for earlier months. A new version needs 100% allocation and fresh acceptance." : "Cancel this entire agreement? Accepted shares are withdrawn and collaborators are notified. A replacement needs fresh consent."}</p><button type="button" disabled={busy || record.status === "locked" && !period} className="btn-outline" onClick={() => void manage(record, record.status === "locked" ? "amend" : "cancel")}>{record.status === "locked" ? "Create future version" : "Confirm cancellation"}</button><button type="button" onClick={() => setManaging(null)}>Keep agreement</button></div> : <button type="button" className="btn-outline" onClick={() => { setManaging(record.id); setPeriod(""); }}>{record.status === "locked" ? "Create future amendment" : "Cancel agreement"}</button>}</div> : null}{record.recipients.map((row: any) => <div key={row.id} className="split-recipient"><div><strong>{row.recipientName}</strong><p>{row.role} | {row.inviteStatus}</p>{row.splitCodeDisplay && row.inviteStatus === "pending" ? <p className="split-code">{row.splitCodeDisplay}<br /><small>Expires {displayDateTime(row.splitCodeExpiresAt)}</small></p> : null}</div><div><strong>{Number(row.sharePercent)}%</strong>{row.inviteStatus === "pending" ? <button disabled={busy} type="button" onClick={() => void respond(row.id, "revoke")}>Withdraw</button> : null}</div></div>)}</Card>)}</List></div> : null}
    {tab === "shared" ? <List empty="Your accepted and declined invitations will appear here.">{data.received.filter(r => r.inviteStatus !== "pending").map(row => <Card key={row.id} title={row.release.title} status={row.inviteStatus}><div className="split-offer"><strong>{Number(row.sharePercent)}<small>%</small></strong><div><p>{row.role}</p><p>Owner: {row.splitRecord.owner.name}</p><p>Agreement: {row.splitRecord.status.replaceAll("_", " ")}</p></div></div></Card>)}</List> : null}
    {tab === "earnings" ? <List empty="Your earnings appear after HYMN imports a royalty statement for an active agreement.">{data.earnings.map(row => <Card key={row.id} title={row.release.title} status={row.status.replaceAll("_", " ")}><div className="split-offer"><strong>{money(row.netShareAmount)}</strong><div><p>{row.recipientRole} | {Number(row.sharePercent)}%</p><p>{new Date(row.royaltyLineItem.statementMonth).toLocaleDateString("en-IN", { month: "long", year: "numeric" })} | {row.royaltyLineItem.platform}</p></div></div></Card>)}</List> : null}
    {tab === "payout-details" ? <PayoutProfileFlow credential={credential} onSubmit={saveCredential}/> : null}
    </>}
  </div>;
}
function PayoutProfileFlow({ credential, onSubmit }: {
    credential: any;
    onSubmit: (values: Record<string, string>) => Promise<boolean>;
}) {
    const [step, setStep] = useState(0);
    const [method, setMethod] = useState<"UPI" | "BANK">("UPI");
    const [values, setValues] = useState<Record<string, string>>({ legalName: "", country: "IN", taxResidency: "", upiId: "", accountHolderName: "", bankAccountNumber: "", ifsc: "", taxInfo: "" });
    const [submitting, setSubmitting] = useState(false);
    const submitted = credential && !["missing", "rejected"].includes(String(credential.status || "missing").toLowerCase());
    const update = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
    const canContinue = step === 0 ? Boolean(values.legalName.trim() && values.country.trim().length === 2) : step === 1 ? method === "UPI" ? Boolean(values.upiId.trim()) : Boolean(values.accountHolderName.trim() && values.bankAccountNumber.trim() && values.ifsc.trim()) : true;
    async function submit() { setSubmitting(true); const ok = await onSubmit({ ...values, method }); setSubmitting(false); if (ok)
        setStep(2); }
    if (submitted)
        return <div className="grid gap-4 lg:grid-cols-[0.8fr,1.2fr]"><Card title="Payout profile" status={credential.status}><p>HYMN is manually reviewing the submitted payout profile. The sensitive form remains closed while review is active.</p><p className="mt-3">Method: {credential.method || "Not reported"}</p><p>Account: {credential.upiIdMasked || credential.bankAccountMasked || "Masked after submission"}</p>{credential.ifscMasked ? <p>IFSC: {credential.ifscMasked}</p> : null}{credential.panLastFour ? <p>PAN: ••••••{credential.panLastFour}</p> : null}<p className="mt-3 text-xs">Submission is not government or bank verification. HYMN finance personnel with payout-review access may review the encrypted values.</p></Card><div className="surface-list-item p-5"><h3 className="font-semibold">Review status</h3><ol className="mt-5 grid gap-4 text-sm">{["Personal information submitted", "Payout details submitted", credential.status === "verified" ? "Manual review completed" : "Manual review in progress"].map((label, index) => <li key={label} className="flex items-center gap-3"><span className="inline-flex h-7 w-7 items-center justify-center rounded-full" style={{ background: index < 2 || credential.status === "verified" ? "var(--success-soft)" : "var(--info-soft)", color: index < 2 || credential.status === "verified" ? "var(--success)" : "var(--info)" }}>{index + 1}</span>{label}</li>)}</ol></div></div>;
    return <div className="grid gap-4 lg:grid-cols-[0.75fr,1.25fr]"><aside className="surface-list-item self-start p-5"><h3 className="font-semibold">Why HYMN needs this</h3><ul className="mt-3 grid gap-3 text-sm" style={{ color: "var(--text-muted)" }}><li>To confirm payout ownership and route manual transfers.</li><li>Encrypted values are available only to authorised finance and verification staff.</li><li>Account, UPI and tax identifiers are masked after submission.</li><li>Documents may be requested separately when manual review requires evidence.</li></ul></aside><section className="surface-list-item p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.14em]" style={{ color: "var(--text-soft)" }}>Stage {step + 1} of 3</p><h3 className="mt-2 text-xl font-semibold">{["Personal information", "Payout details", "Review"][step]}</h3></div><span className="status-pill">Manual KYC review</span></div>{step === 0 ? <div className="mt-5 grid gap-4"><label className="grid gap-2 text-sm font-semibold">Full legal name<input className="field" value={values.legalName} onChange={(event) => update("legalName", event.target.value)}/></label><label className="grid gap-2 text-sm font-semibold">Country code<input className="field uppercase" minLength={2} maxLength={2} value={values.country} onChange={(event) => update("country", event.target.value.toUpperCase())}/></label><label className="grid gap-2 text-sm font-semibold">Tax residency <span className="text-xs font-normal" style={{ color: "var(--text-soft)" }}>Optional</span><input className="field" value={values.taxResidency} onChange={(event) => update("taxResidency", event.target.value)}/></label></div> : null}{step === 1 ? <div className="mt-5 grid gap-4"><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setMethod("UPI")} className={method === "UPI" ? "btn-primary" : "btn-outline"}>UPI</button><button type="button" onClick={() => setMethod("BANK")} className={method === "BANK" ? "btn-primary" : "btn-outline"}>Bank transfer</button></div>{method === "UPI" ? <label className="grid gap-2 text-sm font-semibold">UPI ID<input className="field" value={values.upiId} onChange={(event) => update("upiId", event.target.value)}/><span className="text-xs font-normal" style={{ color: "var(--text-soft)" }}>Displayed as a masked value such as ad••••@upi after submission.</span></label> : <><label className="grid gap-2 text-sm font-semibold">Account holder name<input className="field" value={values.accountHolderName} onChange={(event) => update("accountHolderName", event.target.value)}/></label><label className="grid gap-2 text-sm font-semibold">Bank account number<input className="field" value={values.bankAccountNumber} onChange={(event) => update("bankAccountNumber", event.target.value)}/><span className="text-xs font-normal" style={{ color: "var(--text-soft)" }}>Only the final digits remain visible after submission.</span></label><label className="grid gap-2 text-sm font-semibold">IFSC<input className="field uppercase" value={values.ifsc} onChange={(event) => update("ifsc", event.target.value.toUpperCase())}/></label></>}<label className="grid gap-2 text-sm font-semibold">PAN / GST <span className="text-xs font-normal" style={{ color: "var(--text-soft)" }}>Optional</span><input className="field" value={values.taxInfo} onChange={(event) => update("taxInfo", event.target.value.toUpperCase())}/></label></div> : null}{step === 2 ? <div className="mt-5 grid gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p><strong>Legal name:</strong> {values.legalName}</p><p><strong>Country:</strong> {values.country}</p><p><strong>Method:</strong> {method}</p><p><strong>Account:</strong> {method === "UPI" ? values.upiId.replace(/^(.{2}).*(@.*)$/, "$1••••$2") : `••••${values.bankAccountNumber.slice(-4)}`}</p><p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>Submitting sends the profile to HYMN for manual review. It does not trigger an automated bank or government verification.</p></div> : null}<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><button type="button" disabled={step === 0 || submitting} onClick={() => setStep((current) => Math.max(0, current - 1))} className="btn-outline disabled:opacity-40">Previous</button>{step < 2 ? <button type="button" disabled={!canContinue} onClick={() => setStep((current) => current + 1)} className="btn-primary disabled:opacity-40">Continue</button> : <button type="button" disabled={submitting} onClick={submit} className="btn-primary disabled:opacity-40">{submitting ? "Submitting…" : "Submit for manual review"}</button>}</div></section></div>;
}
function Metric({ label, value }: {
    label: string;
    value: string | number;
}) { return <div className="metric-card"><p className="text-xs" style={{ color: "var(--text-soft)" }}>{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>; }
function List({ children, empty }: {
    children: React.ReactNode;
    empty: string;
}) { const count = Array.isArray(children) ? children.length : 1; return <div className="grid gap-3">{count ? children : <p className="split-empty" style={{ color: "var(--text-soft)" }}>{empty}</p>}</div>; }
function Card({ title, status, children }: {
    title: string;
    status: string;
    children: React.ReactNode;
}) { return <article className="split-card"><div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{title}</h3><span className="status-pill status-pill-active capitalize">{status}</span></div><div className="mt-3 space-y-1 text-sm" style={{ color: "var(--text-muted)" }}>{children}</div></article>; }
