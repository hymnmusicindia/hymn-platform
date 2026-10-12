"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, ChevronRight, MessageCircle, Network, Send, Shield, Users, X } from "lucide-react";
import "@/app/styles/referral-circle.css";

type Person = { id: number; name: string; avatar: string | null; handle?: { tag: string } | null };
type Conversation = { id: number; person: Person; relationship: string; joinedAt: string; blocked: boolean; blockedByYou: boolean; latest: string | null; unread: number };
type Message = { id: number; senderId: number; body: string; createdAt: string; clientKey: string };
type Node = Person & { referralId: number; children: number; direct: boolean };
function Avatar({ person }: { person: Person }) {
  return <span className="rc-avatar">{person.avatar && /^(https?:\/\/|\/)/.test(person.avatar) ? <Image src={person.avatar} alt="" width={44} height={44} unoptimized referrerPolicy="no-referrer" /> : person.name.slice(0, 1).toUpperCase()}</span>;
}
async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init }); const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not load your circle. Try again.");
  return body;
}
export function ReferralCircle() {
  const [conversations, setConversations] = useState<Conversation[]>([]), [cursor, setCursor] = useState<number | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null), [view, setView] = useState<"people" | "network">("people");
  const [messages, setMessages] = useState<Message[]>([]), [hasOlder, setHasOlder] = useState(false), [userId, setUserId] = useState(0);
  const [draft, setDraft] = useState(""), [sending, setSending] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [nodes, setNodes] = useState<Node[]>([]), [networkCursor, setNetworkCursor] = useState<number | null>(null), [branch, setBranch] = useState<Person[]>([]);
  const retry = useRef<{ body: string; key: string } | null>(null), end = useRef<HTMLDivElement>(null);
  const openedInvitation = useRef(false), networkRequest = useRef(0);
  const selectedId = selected?.id;
  const activeId = useRef(selectedId); activeId.current = selectedId;
  const loadPeople = useCallback(async (next?: number) => {
    try { const body = await json(`/api/referrals/conversations${next ? `?cursor=${next}` : ""}`); setConversations(previous => next ? [...previous, ...body.conversations] : body.conversations); setCursor(body.nextCursor); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadPeople(); }, [loadPeople]);
  useEffect(() => {
    if (openedInvitation.current || loading) return;
    openedInvitation.current = true;
    const requested = Number(new URLSearchParams(window.location.search).get("conversation"));
    if (!requested) return;
    const existing = conversations.find(row => row.id === requested);
    if (existing) setSelected(existing);
    else void json(`/api/referrals/conversations/${requested}`).then(body => setSelected(body.conversation)).catch(() => setError("This conversation is unavailable."));
  }, [conversations, loading]);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setMessages([]); setDraft(""); retry.current = null; setError("");
    let newest = 0;
    async function poll() {
      if (document.hidden) return;
      try {
        const body = await json(`/api/referrals/conversations/${selectedId}${newest ? `?after=${newest}` : ""}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setUserId(body.userId);
        if (body.conversation) setSelected(previous => previous?.id === selectedId ? { ...previous, ...body.conversation } : previous);
        if (!newest) setHasOlder(body.hasMore);
        if (body.messages.length) {
          newest = Math.max(newest, ...body.messages.map((row: Message) => row.id));
          setMessages(previous => [...new Map([...previous, ...body.messages].map((row: Message) => [row.id, row])).values()].sort((a, b) => a.id - b.id));
          await json(`/api/referrals/conversations/${selectedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ readThrough: newest }), signal: controller.signal });
          setConversations(previous => previous.map(row => row.id === selectedId ? { ...row, unread: 0 } : row));
        }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load messages."); }
    }
    void poll(); const timer = setInterval(() => void poll(), 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId) return;
    const previous = document.activeElement as HTMLElement | null;
    const saved = document.body.style.overflow; document.body.style.overflow = "hidden";
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSelected(null); return; }
      if (event.key !== "Tab") return;
      const elements = Array.from(document.querySelectorAll<HTMLElement>('.rc-chat button:not(:disabled), .rc-chat textarea:not(:disabled)'));
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { document.body.style.overflow = saved; document.removeEventListener("keydown", trap); previous?.focus(); };
  }, [selectedId]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);
  const parentId = branch.at(-1)?.id;
  const loadNetwork = useCallback(async (next?: number) => {
    setError(""); const requestId = ++networkRequest.current;
    try { const query = new URLSearchParams(); if (parentId) query.set("parent", String(parentId)); if (next) query.set("cursor", String(next)); const body = await json(`/api/referrals/network?${query}`); if (requestId !== networkRequest.current) return; setNodes(previous => next ? [...previous, ...body.nodes] : body.nodes); setNetworkCursor(body.nextCursor); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load network."); }
  }, [parentId]);
  useEffect(() => { if (view === "network") void loadNetwork(); }, [view, loadNetwork]);
  async function send() {
    if (!selected || !draft.trim() || sending) return;
    const text = draft.trim(), conversationId = selected.id;
    if (retry.current?.body !== text) retry.current = { body: text, key: crypto.randomUUID() };
    setSending(true); setError("");
    try {
      const result = await json(`/api/referrals/conversations/${conversationId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text, clientKey: retry.current.key }) });
      if (activeId.current !== conversationId) return;
      setMessages(previous => [...new Map([...previous, result.message].map(row => [row.id, row])).values()].sort((a, b) => a.id - b.id));
      setDraft(""); retry.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : "Message could not be sent."); }
    finally { setSending(false); }
  }
  async function block() {
    if (!selected) return;
    try { await json(`/api/referrals/conversations/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocked: !selected.blockedByYou }) }); await loadPeople(); setSelected(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update conversation."); }
  }
  async function older() {
    if (!selectedId || !messages.length) return;
    try { const body = await json(`/api/referrals/conversations/${selectedId}?before=${messages[0].id}`); setMessages(previous => [...body.messages, ...previous]); setHasOlder(body.hasMore); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load messages."); }
  }
  return <section className="rc" aria-label="Your referral circle">
    <header className="rc-heading"><div><span className="rc-eyebrow">YOUR PEOPLE</span><h3>A connection beyond the link.</h3></div><div className="rc-tabs" role="group" aria-label="Circle view"><button aria-pressed={view === "people"} onClick={() => setView("people")}><MessageCircle size={16} /> Messages</button><button aria-pressed={view === "network"} onClick={() => setView("network")}><Network size={16} /> Network</button></div></header>
    {error ? <p role="alert" className="rc-error">{error} <button onClick={() => void (view === "people" ? loadPeople() : loadNetwork())}>Retry</button></p> : null}
    {view === "people" ? <div className="rc-people">{loading ? <p role="status">Loading your circle…</p> : conversations.length ? conversations.map(row => <button key={row.id} className="rc-person" onClick={() => { setSelected(row); setError(""); }}><Avatar person={row.person} /><span className="rc-person-copy"><strong>{row.person.name}</strong><small>{row.relationship}{row.person.handle ? ` ? @${row.person.handle.tag}` : ""}</small><span>{row.latest || "Say hello. Build your next chapter."}</span></span>{row.unread ? <b className="rc-badge" aria-label={`${row.unread} unread messages`}>{row.unread}</b> : <ArrowUpRight size={17} />}</button>) : <div className="rc-empty"><Users size={30} /><strong>Your circle starts with an invitation.</strong><p>When someone joins, their profile and chat appear here.</p></div>}{cursor ? <button className="rc-more" onClick={() => void loadPeople(cursor)}>More connections <ChevronRight size={16} /></button> : null}</div> : <div className="rc-network"><div className="rc-trail"><button onClick={() => setBranch([])}>You</button>{branch.map((person, index) => <span key={person.id}><ChevronRight size={13} /><button onClick={() => setBranch(previous => previous.slice(0, index + 1))}>{person.name}</button></span>)}</div><div className="rc-levels" aria-label="Network commission rates">{[1, 2, 3, 4, 5, 6, 7].map(level => <div className={level === branch.length + 1 ? "active" : ""} key={level}><span>L{level}</span><strong>{level === 1 ? "Direct" : level === 2 ? "1%" : "0.5%"}</strong></div>)}</div><p className="rc-note">Indirect percentages apply to the direct commission. Only eligible paid sales earn rewards.</p><div className="rc-tree">{nodes.length ? nodes.map(node => <div className="rc-node" key={node.id}><Avatar person={node} /><span><strong>{node.name}</strong><small>Level {branch.length + 1} · {node.children} connections</small></span>{node.children ? <button aria-label={`Explore ${node.name}'s referrals`} onClick={() => setBranch(previous => [...previous, node])}><ChevronRight size={18} /></button> : null}</div>) : <div className="rc-empty"><Network size={28} /><strong>No connections on this branch yet.</strong></div>}</div>{networkCursor ? <button className="rc-more" onClick={() => void loadNetwork(networkCursor)}>More connections</button> : null}</div>}
    {selected ? <div className="rc-overlay" onClick={() => setSelected(null)}><section role="dialog" aria-modal="true" aria-label={`Chat with ${selected.person.name}`} className="rc-chat" onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape") setSelected(null); }}><header><Avatar person={selected.person} /><span><strong>{selected.person.name}</strong><small>{selected.relationship}{selected.person.handle ? ` ? @${selected.person.handle.tag}` : ""}</small></span><button aria-label={selected.blockedByYou ? "Resume conversation" : "Pause conversation"} title={selected.blockedByYou ? "Resume conversation" : "Pause conversation"} onClick={() => void block()}><Shield size={18} /></button><button aria-label="Close chat" onClick={() => setSelected(null)}><X size={20} /></button></header><div className="rc-messages" role="log" aria-label="Messages">{hasOlder ? <button className="rc-more" onClick={() => void older()}><ArrowLeft size={14} /> Earlier messages</button> : null}{messages.length ? messages.map(message => <div key={message.id} className={`rc-message ${message.senderId === userId ? "mine" : ""}`}><p>{message.body}</p><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></div>) : <div className="rc-empty"><MessageCircle size={28} /><strong>Start with a hello.</strong><p>Keep payment details and passwords private.</p></div>}<div ref={end} /></div>{error ? <p role="alert" className="rc-error">{error}</p> : null}{selected.blocked ? <p className="rc-note">Conversation paused. {selected.blockedByYou ? <button onClick={() => void block()}>Resume</button> : "The other member can resume it."}</p> : <form onSubmit={event => { event.preventDefault(); void send(); }}><textarea aria-label="Message" placeholder="Write a message…" value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} rows={2} disabled={sending} autoFocus /><button type="submit" aria-label="Send message" disabled={sending || !draft.trim()}><Send size={18} /></button></form>}</section></div> : null}
  </section>;
}
