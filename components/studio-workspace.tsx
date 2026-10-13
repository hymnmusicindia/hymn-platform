"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, Download, FileAudio, Headphones, Paperclip, Phone, Send, ShieldCheck, Ticket, Wallet, X } from "lucide-react";
import { loadBioRazorpay } from "@/lib/client-razorpay";
import type { StudioWorkspaceView } from "@/lib/studio-workspace-view";
import { StudioFileUpload } from "@/components/studio-file-upload";
import { StudioOrderActions } from "@/components/studio-order-actions";
import "@/app/styles/studio-conversation.css";
type ChatMessage = StudioWorkspaceView["messages"][number];
type Outgoing = ChatMessage & { retryBody: { body: string; idempotencyKey: string; callbackPhone?: string }; state: "sending" | "failed" };
const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const date = (s: string) => new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export function StudioWorkspace({ workspace: initial, userId }: { workspace: StudioWorkspaceView; userId: number }) {
 const router = useRouter();
 const [workspace, setWorkspace] = useState(initial), [outbox, setOutbox] = useState<Outgoing[]>([]);
 const [message, setMessage] = useState(""), [phone, setPhone] = useState(""), [mode, setMode] = useState<"message" | "revision" | "callback">("message");
 const [panel, setPanel] = useState<"upload" | "delivery" | null>(null), [selectedFiles, setSelectedFiles] = useState<number[]>([]), [deliveryNote, setDeliveryNote] = useState("");
 const [pending, setPending] = useState(""), [error, setError] = useState(""), [offline, setOffline] = useState(false);
 const [older, setOlder] = useState<ChatMessage[]>([]), [hasOlder, setHasOlder] = useState(initial.messages.length === 100);
 const bottom = useRef<HTMLDivElement>(null), scroll = useRef<HTMLDivElement>(null), first = useRef(true);
 const customer = workspace.customerId === userId, base = `/api/studio/orders/${workspace.publicId}`;
 const latest = workspace.deliveries[0], closed = ["CANCELLED", "REFUNDED", "EXPIRED"].includes(workspace.status);
 const refresh = useCallback(async () => {
  const response = await fetch(`/api/studio/orders/${initial.publicId}/workspace`, { cache: "no-store" });
  if (!response.ok) throw new Error("Conversation connection interrupted.");
  const data = await response.json();
  setWorkspace(current => ({ ...data.workspace, messages: Array.from(new Map([...current.messages, ...data.workspace.messages].map((m: ChatMessage) => [m.id, m])).values()).sort((a: ChatMessage, b: ChatMessage) => a.id - b.id) }));
  setOutbox(items => items.filter(item => !data.workspace.messages.some((m: ChatMessage) => m.senderUserId === userId && m.idempotencyKey?.endsWith(`:${item.retryBody.idempotencyKey}`))));
  setOffline(false);
 }, [initial.publicId, userId]);
 useEffect(() => { setWorkspace(initial); }, [initial]);
 useEffect(() => {
  let stopped = false; let timer: ReturnType<typeof setTimeout>;
  async function poll() { if (stopped) return; if (!document.hidden) await refresh().catch(() => { if (!stopped) setOffline(true); }); if (!stopped) timer = setTimeout(poll, 2500); }
  timer = setTimeout(poll, 1000);
  const visible = () => { if (!document.hidden) void refresh().catch(() => setOffline(true)); };
  document.addEventListener("visibilitychange", visible);
  return () => { stopped = true;  clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
 }, [refresh]);
 useEffect(() => {
  const nearEnd = !scroll.current || scroll.current.scrollHeight - scroll.current.scrollTop - scroll.current.clientHeight < 180;
  if (first.current || nearEnd) { bottom.current?.scrollIntoView({ behavior: first.current ? "instant" : "smooth", block: "end" }); first.current = false; }
 }, [workspace.messages.length, workspace.files.length, workspace.deliveries.length, outbox.length]);
 async function action(path: string, body: unknown, label: string) {
  if (pending) return;
  setPending(label); setError("");
  try { const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Request failed."); await refresh().catch(() => setOffline(true)); return data; }
  catch (e) { setError(e instanceof Error ? e.message : "Request failed."); }
  finally { setPending(""); }
 }
 async function transmit(item: Outgoing) {
  setOutbox(items => items.map(m => m.id === item.id ? { ...m, state: "sending" } : m));
  try {
   const response = await fetch(`${base}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.retryBody) });
   const data = await response.json(); if (!response.ok) throw new Error(data.error || "Message failed.");
   setWorkspace(current => ({ ...current, messages: [...current.messages.filter(m => m.id !== data.message.id), data.message].sort((a,b) => a.id-b.id) }));
   setOutbox(items => items.filter(m => m.id !== item.id));
  } catch (e) { setOutbox(items => items.map(m => m.id === item.id ? { ...m, state: "failed" } : m)); setError(e instanceof Error ? e.message : "Could not send message."); }
 }
 async function send(event: React.FormEvent) {
  event.preventDefault(); if (!message.trim()) return;
  if (mode === "revision" && latest) { const data = await action(`${base}/revisions`, { deliveryId: latest.id, feedback: message, idempotencyKey: crypto.randomUUID() }, "Requesting revision"); if (data) { setMessage(""); setMode("message"); } return; }
  if (mode === "callback" && !/^\+?[0-9 ()-]{8,20}$/.test(phone)) { setError("Add a valid callback number, including country code."); return; }
  const key = crypto.randomUUID(), body = { body: message.trim(), idempotencyKey: key, ...(mode === "callback" ? { callbackPhone: phone } : {}) };
  const item: Outgoing = { id: -Date.now(), senderUserId: userId, senderName: customer ? "You" : workspace.engineerName, body: body.body, kind: mode === "callback" ? "CALLBACK" : "USER", metadata: mode === "callback" ? { phone } : null, createdAt: new Date().toISOString(), idempotencyKey: `chat:${initial.publicId}:${key}`, retryBody: body, state: "sending" };
  setOutbox(items => [...items, item]); setMessage(""); setPhone(""); setMode("message"); setError(""); void transmit(item);
 }
 async function pay(path: string, description: string) {
  const data = await action(path, { idempotencyKey: crypto.randomUUID() }, "Opening checkout"); if (!data) return;
  try {
   await loadBioRazorpay(); if (!window.Razorpay) throw new Error("Payment checkout is unavailable.");
   new window.Razorpay({ key: data.key, amount: data.amount, currency: data.currency, name: "HYMN Studio", description, order_id: data.orderId, handler: async (result: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => { await action("/api/studio/payments/verify", result, "Verifying payment"); }, modal: { ondismiss: () => { void refresh(); } } }).open();
  } catch (e) { setError(e instanceof Error ? e.message : "Could not open checkout."); }
 }
 async function history() { const before = Math.min(...[...older, ...workspace.messages].map(m => m.id)); const response = await fetch(`${base}/messages?before=${before}`); const data = await response.json(); if (!response.ok) { setError(data.error); return; } setOlder(items => [...data.messages, ...items]); setHasOlder(data.messages.length === 100); }
 const allMessages = Array.from(new Map([...older, ...workspace.messages].map(m => [m.id,m])).values());
 const timeline = [
  ...allMessages.map(item => ({ key: `m${item.id}`, time: item.createdAt, node: item.kind === "SYSTEM" ? <p className="studio-system-event">{item.body}</p> : <div className={`studio-chat-bubble ${item.senderUserId === userId ? "is-mine" : ""}`}><small>{item.senderUserId === userId ? "You" : item.senderName}</small>{item.kind === "CALLBACK" ? <strong><Phone size={14}/>Callback · {item.metadata?.state || "REQUESTED"} · {item.metadata?.phone}</strong> : null}<p>{item.body}</p>{item.kind === "CALLBACK" && !customer && item.metadata?.state !== "DONE" ? <div className="mt-2 flex gap-2"><button className="text-xs underline" onClick={() => action(`${base}/callbacks/${item.id}`,{state:item.metadata?.state==="ACCEPTED"?"DONE":"ACCEPTED"},"Updating callback")}>{item.metadata?.state==="ACCEPTED"?"Mark call done":"Accept callback"}</button></div>:null}<time>{date(item.createdAt)}</time></div> })),
  ...workspace.payments.map(item => ({ key: `p${item.id}`, time: item.createdAt, node: <article className="studio-receipt"><Wallet/><small>{item.purpose === "INITIAL_ORDER" ? "Service fee" : item.purpose === "ADDITIONAL_REVISION" ? "Additional revision" : "Scope change"} · {item.status === "REFUNDED" ? "Refunded" : "Paid securely"}</small><strong>{money(item.amount)}</strong><time>{date(item.createdAt)}</time><span><ShieldCheck size={13}/>Verified by HYMN</span></article> })),
  ...workspace.files.map(file => ({ key: `f${file.id}`, time: file.createdAt, node: <article className={`studio-file-event ${file.uploaderId === userId ? "is-mine" : ""}`}><FileAudio/><div><small>{file.category === "SOURCE" ? "Source attachment" : "Engineer attachment"}</small><a href={`/api/assets/${file.assetId}/download`}>{file.name}<Download size={14}/></a><time>{date(file.createdAt)}</time></div></article> })),
  ...workspace.revisions.map(r => ({ key: `r${r.id}`, time: r.createdAt, node: <article className="studio-ticket-event"><strong><Ticket size={16}/>Revision #{r.sequence}<span>{r.included ? "Included" : money(workspace.additionalRevisionPrice)}</span></strong><p>{r.feedback}</p><small>{r.status.replaceAll("_"," ")} · {date(r.createdAt)}</small>{customer && r.status === "PAYMENT_REQUIRED" ? <button disabled={Boolean(pending)} className="btn-primary" onClick={() => pay(`${base}/revisions/${r.id}/payment`, "Additional revision")}>Pay {money(workspace.additionalRevisionPrice)} securely</button> : null}</article> })),
  ...workspace.amendments.map(a => ({ key: `a${a.publicId}`, time: a.createdAt, node: <article className="studio-ticket-event"><strong>Scope change · {money(a.amount)}</strong><p>{a.description}</p><small>{a.status.replaceAll("_"," ")}</small>{customer && ["PROPOSED","AWAITING_PAYMENT"].includes(a.status) ? <button className="btn-outline" disabled={Boolean(pending)} onClick={() => pay(`${base}/amendments/${a.publicId}/payment`, a.description)}>Accept and pay</button> : null}</article> })),
  ...workspace.deliveries.map(d => ({ key: `d${d.id}`, time: d.createdAt, node: <article className="studio-delivery-event"><strong><CheckCheck size={19}/>Final delivery · v{d.version}</strong><p>{d.note}</p>{d.files.map(f => <div key={f.studioFileId}>{f.mimeType.startsWith("audio/") ? <audio controls preload="none" src={`/api/assets/${f.assetId}/download`}/> : null}<a href={`/api/assets/${f.assetId}/download`}>{f.name}<Download size={13}/></a></div>)}<small>Engineer {d.engineerConfirmedAt ? "confirmed" : "confirmation pending"} · Client {d.customerConfirmedAt ? "confirmed" : "confirmation pending"}</small>{d.id === latest?.id && workspace.status === "DELIVERED" ? <div className="studio-delivery-actions"><button className="btn-primary" disabled={Boolean(pending) || Boolean(customer ? d.customerConfirmedAt : d.engineerConfirmedAt)} onClick={() => action(`${base}/approve`, { deliveryId: d.id, idempotencyKey: crypto.randomUUID() }, "Confirming completion")}>Confirm work is done</button>{customer ? <button className="btn-outline" onClick={() => setMode("revision")}>Request revision</button> : null}</div> : null}</article> })),
 ].sort((a,b) => a.time.localeCompare(b.time));
 const availableFiles = workspace.files.filter(f => f.category === "DELIVERY" && !workspace.deliveries.some(d => d.files.some(df => df.studioFileId === f.id)));
 const canDeliver = !customer && ["ACCEPTED","AWAITING_SOURCE_FILES","IN_PROGRESS","REVISION_REQUESTED"].includes(workspace.status);
 const canSource = customer && ["ACCEPTED","AWAITING_SOURCE_FILES","IN_PROGRESS","REVISION_REQUESTED","DELIVERED"].includes(workspace.status);
 return <main className="studio-room shell"><header className="studio-room-heading"><div><Link href={customer ? "/dashboard/studio" : "/studio/engineer"}>← Projects</Link><h1>{workspace.projectTitle}</h1><p><Headphones size={15}/>{workspace.engineerName}<span> · {workspace.status.replaceAll("_"," ")}</span></p></div><span><ShieldCheck size={15}/>Private project</span></header><div className="studio-room-grid"><section className="studio-conversation"><header><strong>Project conversation</strong><small>{offline ? "Reconnecting…" : "Updates automatically"}</small></header><div className="studio-conversation-history" ref={scroll} role="log" aria-label="Project messages and events">{hasOlder ? <button className="btn-outline" onClick={() => void history().catch(() => setError("Could not load history."))}>Load earlier messages</button> : null}{!timeline.length ? <div className="studio-empty-chat"><Headphones/><h2>Your next great record starts here.</h2><p>Payment, files, feedback and finished masters stay together.</p></div> : timeline.map(item => <div key={item.key}>{item.node}</div>)}{outbox.map(item => <div key={item.id} className="studio-chat-bubble is-mine"><p>{item.body}</p><small>{item.state === "sending" ? "Sending…" : <button type="button" onClick={() => void transmit(item)}>Not sent · retry</button>}</small></div>)}<div ref={bottom}/></div>
 {error ? <div className="studio-room-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={14}/></button></div> : null}
 {customer && workspace.status === "AWAITING_PAYMENT" ? <div className="studio-chat-unlock"><strong>{money(workspace.finalPrice)} · Mixing & mastering</strong><p>Pay securely to open your project conversation.</p><button disabled={Boolean(pending)} className="btn-primary" onClick={() => pay(`${base}/payment`, workspace.projectTitle)}>Pay service fee</button></div> : null}
 {workspace.paidAt && !closed ? <><div className="studio-composer-tools">{canSource || canDeliver ? <button onClick={() => setPanel(panel === "upload" ? null : "upload")}><Paperclip size={16}/>Attach files</button> : null}{canDeliver ? <button onClick={() => setPanel(panel === "delivery" ? null : "delivery")}><CheckCheck size={16}/>Final delivery</button> : null}{customer && workspace.status === "DELIVERED" ? <button onClick={() => setMode(mode === "revision" ? "message" : "revision")}><Ticket size={16}/>Revision ticket</button> : null}{customer ? <button onClick={() => setMode(mode === "callback" ? "message" : "callback")}><Phone size={16}/>Request callback</button> : null}</div>
 {panel === "upload" ? <div className="studio-inline-panel"><StudioFileUpload orderPublicId={workspace.publicId} role={customer ? "SOURCE" : "DELIVERY"} onUploaded={() => { void refresh(); setPanel(null); }}/></div> : null}
 {panel === "delivery" ? <div className="studio-inline-panel"><h3>Choose files for this final delivery</h3>{availableFiles.map(file => <label key={file.id}><input type="checkbox" checked={selectedFiles.includes(file.id)} onChange={() => setSelectedFiles(ids => ids.includes(file.id) ? ids.filter(id => id !== file.id) : [...ids,file.id])}/>{file.name}</label>)}{!availableFiles.length ? <p>Attach new delivery files first.</p> : null}<textarea className="field" placeholder="What changed? What should the client listen for?" value={deliveryNote} onChange={e => setDeliveryNote(e.target.value)} maxLength={2000}/><button className="btn-primary" disabled={!selectedFiles.length || Boolean(pending)} onClick={async () => { const data = await action(`${base}/deliveries`, { studioFileIds: selectedFiles, note: deliveryNote, idempotencyKey: crypto.randomUUID() }, "Sending final delivery"); if(data){setPanel(null);setSelectedFiles([]);setDeliveryNote("");} }}>Send final delivery</button></div> : null}
 <form onSubmit={send} className="studio-composer">{mode !== "message" ? <div className="studio-composer-mode"><strong>{mode === "callback" ? "Request a callback" : `Revision ticket · ${workspace.activeRevisionCount < workspace.includedRevisions ? "included" : money(workspace.additionalRevisionPrice)}`}</strong><button type="button" onClick={() => setMode("message")} aria-label="Close mode"><X size={15}/></button></div> : null}{mode === "callback" ? <input className="field" type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="Your number with country code · shared only in this project"/> : null}<div><textarea aria-label={mode === "revision" ? "Revision issue" : "Project message"} value={message} onChange={e => setMessage(e.target.value)} placeholder={mode === "revision" ? "Describe the issue. Add a timestamp and desired change…" : mode === "callback" ? "What would you like to discuss? Add a preferred time…" : "Message your project partner…"} rows={2} maxLength={5000} required/><button className="btn-primary" disabled={!message.trim() || (mode === "revision" && Boolean(pending))} aria-label="Send"><Send size={18}/></button></div></form></> : null}</section>
 <aside className="studio-room-summary"><section><p className="hymn-kicker">Your agreement</p><h2>{money(workspace.finalPrice)}</h2><p>{workspace.includedRevisions} included revisions</p><p>Extra revision: {money(workspace.additionalRevisionPrice)}</p><small>Completion and earnings release require confirmation from both participants.</small>{!customer && workspace.status === "AWAITING_ENGINEER_ACCEPTANCE" ? <div className="studio-delivery-actions"><button className="btn-primary" disabled={Boolean(pending)} onClick={() => action(`${base}/respond`, { accept: true }, "Accepting")}>Accept project</button><button className="btn-outline" disabled={Boolean(pending)} onClick={() => action(`${base}/respond`, { accept: false }, "Declining")}>Decline</button></div> : null}</section>
 {customer && workspace.status === "COMPLETED" && latest ? <section><CheckCheck/><h2>Your record is ready.</h2><label>Master for distribution<select className="field" value={selectedFiles[0] ?? ""} onChange={e => setSelectedFiles([Number(e.target.value)])}><option value="">Choose an audio master</option>{latest.files.filter(f => f.mimeType.startsWith("audio/")).map(f => <option key={f.studioFileId} value={f.studioFileId}>{f.name}</option>)}</select></label><button className="btn-primary" disabled={!selectedFiles[0] || Boolean(pending)} onClick={async () => { const data = await action(`${base}/release-handoff`, { finalStudioFileId: selectedFiles[0] }, "Preparing release"); if(data)router.push(data.href); }}>Distribute with HYMN</button></section> : null}
 <StudioOrderActions orderPublicId={workspace.publicId} status={workspace.status} customer={customer} reviewed={workspace.reviewed} amendments={[]} onChanged={() => void refresh()}/>
 <Link href="/studio/readiness" className="btn-outline">Mix-readiness guide</Link></aside></div></main>;
}
