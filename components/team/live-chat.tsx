"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./live-chat.module.css";

type Person = { id: string; user: { name: string; avatar?: string | null } };
type Message = { id: string; clientKey: string; authorId: string; author: Person; body: string; createdAt: string; readMemberIds: string[]; deletedAt?: string | null };
type Snapshot = { items: Message[]; readers: Person[] };
type Pending = { key: string; body: string; createdAt: string; status: "sending" | "failed" };
type Props = {
  actor: { id: string; name: string; workspaceId: string };
  channels: { id: string; name: string; private: boolean }[];
  canCreate: boolean;
  onCreate: () => void;
};

export function TeamLiveChat({ actor, channels, canCreate, onCreate }: Props) {
  const [channel, setChannel] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot>({ items: [], readers: [] });
  const [pending, setPending] = useState<Record<string, Pending[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [connection, setConnection] = useState("Connecting…");
  const [error, setError] = useState("");
  const [newMessages, setNewMessages] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const visible = useRef(new Set<string>());
  const marking = useRef(false);
  const currentChannel = useRef(channel);
  currentChannel.current = channel;

  useEffect(() => {
    if (!channels.some(c => c.id === channel)) setChannel(channels[0]?.id || "");
  }, [channels, channel]);

  useEffect(() => {
    if (!channel) return;
    let live = true;
    let source: EventSource | undefined;
    let fallback: ReturnType<typeof setInterval> | undefined;
    let polling = false;
    setSnapshot({ items: [], readers: [] });
    setError("");
    nearBottom.current = true;
    setNewMessages(false);
    const params = new URLSearchParams({ channel, workspace: actor.workspaceId });
    const accept = (data: Snapshot) => {
      if (!live) return;
      setSnapshot(data);
      setPending(old => ({ ...old, [channel]: (old[channel] || []).filter(p => !data.items.some(m => m.clientKey === `${actor.id}:${p.key}`)) }));
      if (nearBottom.current) requestAnimationFrame(() => viewport.current?.scrollTo({ top: viewport.current.scrollHeight }));
      else setNewMessages(true);
    };
    const poll = async () => {
      if (document.hidden || !live || polling) return;
      polling = true;
      try {
        const response = await fetch(`/api/team/messages?${params}`, { cache: "no-store" });
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          source?.close(); clearInterval(fallback); setSnapshot({ items: [], readers: [] }); setError("Conversation access unavailable."); return;
        }
        if (!response.ok) throw new Error();
        accept(await response.json());
      } catch { if (live) setConnection("Reconnecting… your draft is safe"); }
      finally { polling = false; }
    };
    const connect = () => {
      source?.close(); clearInterval(fallback); fallback = undefined;
      if (document.hidden || !live) return;
      setConnection("Connecting…");
      source = new EventSource(`/api/team/chat-stream?${params}`);
      source.onmessage = event => {
        setConnection("Live · latest 50 messages");
        clearInterval(fallback); fallback = undefined;
        try { accept(JSON.parse(event.data)); } catch { setError("Could not read an update."); }
      };
      source.onerror = () => {
        if (!live) return;
        setConnection("Reconnecting…");
        if (!fallback) fallback = setInterval(poll, 3000);
      };
      source.addEventListener("unavailable", () => {
        source?.close(); clearInterval(fallback);
        setSnapshot({ items: [], readers: [] }); setError("Conversation unavailable. Reopen it to reconnect.");
      });
    };
    const visibility = () => { if (document.hidden) { source?.close(); clearInterval(fallback); } else { void poll(); connect(); } };
    connect();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", connect);
    return () => { live = false; source?.close(); clearInterval(fallback); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", connect); };
  }, [channel, actor.id, actor.workspaceId]);

  useEffect(() => {
    visible.current.clear();
    if (!channel || !viewport.current) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.message;
        if (id) { if (entry.isIntersecting) visible.current.add(id); else visible.current.delete(id); }
      }
    }, { root: viewport.current, threshold: 0.6 });
    viewport.current.querySelectorAll("[data-message]").forEach(node => observer.observe(node));
    const timer = setInterval(async () => {
      if (document.hidden || !document.hasFocus() || marking.current) return;
      const ids = snapshot.items.filter(m => visible.current.has(m.id) && !m.deletedAt && !m.readMemberIds.includes(actor.id)).map(m => m.id);
      if (!ids.length) return;
      marking.current = true;
      try {
        const response = await fetch(`/api/team/messages-read?workspace=${encodeURIComponent(actor.workspaceId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: channel, ids }) });
        if (response.ok && currentChannel.current === channel) setSnapshot(old => ({ ...old, items: old.items.map(m => ids.includes(m.id) ? { ...m, readMemberIds: [...new Set([...m.readMemberIds, actor.id])] } : m) }));
      } catch { /* A reconnect retries only still-unread visible messages. */ }
      finally { marking.current = false; }
    }, 1000);
    return () => { observer.disconnect(); clearInterval(timer); };
  }, [snapshot.items, channel, actor.id, actor.workspaceId]);

  const send = async (item: Pending, target: string) => {
    setPending(old => ({ ...old, [target]: [...(old[target] || []).filter(p => p.key !== item.key), { ...item, status: "sending" }] }));
    setError("");
    try {
      const response = await fetch(`/api/team/messages?workspace=${encodeURIComponent(actor.workspaceId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: target, body: item.body, clientKey: item.key }), signal: AbortSignal.timeout(20000) });
      const message = await response.json();
      if (!response.ok) throw new Error(message.error || "Message could not be sent.");
      if (currentChannel.current === target) setSnapshot(old => ({ ...old, items: [...old.items.filter(m => m.id !== message.id), { ...message, author: { id: actor.id, user: { name: actor.name } } }].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).slice(-50) }));
      setPending(old => ({ ...old, [target]: (old[target] || []).filter(p => p.key !== item.key) }));
    } catch (failure) {
      setPending(old => ({ ...old, [target]: (old[target] || []).map(p => p.key === item.key ? { ...p, status: "failed" } : p) }));
      setError(failure instanceof Error ? failure.message : "Message could not be sent.");
    }
  };

  const jump = () => { nearBottom.current = true; setNewMessages(false); viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: "smooth" }); };
  const time = (value: string) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value));
  return <section className={styles.chat}>
    <aside className={styles.channels}><header><h2>Conversations</h2>{canCreate && <button aria-label="New conversation" onClick={onCreate}>+</button>}</header>{channels.map(c => <button key={c.id} aria-pressed={channel === c.id} onClick={() => setChannel(c.id)}>{c.private ? "🔒" : "#"} {c.name}</button>)}</aside>
    <div className={styles.conversation}>
      <header className={styles.heading}><h2>{channels.find(c => c.id === channel)?.name || "Choose a conversation"}</h2><span role="status">{channel ? connection : "No conversation selected"}</span></header>
      <div ref={viewport} className={styles.messages} role="log" aria-label="Conversation messages" aria-live="polite" onScroll={() => { const el = viewport.current; if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (nearBottom.current) setNewMessages(false); }}>
        {snapshot.items.map(m => {
          const readers = snapshot.readers.filter(p => p.id !== m.authorId && m.readMemberIds.includes(p.id));
          return <article key={m.id} data-message={m.id} className={`${styles.message} ${m.authorId === actor.id ? styles.mine : ""}`}>
            <div className={styles.bubble}><strong>{m.author.user.name}</strong><p>{m.body}</p></div><div className={styles.meta}><time dateTime={m.createdAt}>{time(m.createdAt)}</time>{m.authorId === actor.id && <span>Sent</span>}</div>
            {!!readers.length && <div className={styles.receipts} aria-label={`Seen by ${readers.map(p => p.user.name).join(", ")}`}>{readers.slice(0, 8).map(p => <span className={styles.avatar} key={p.id} title={`Seen by ${p.user.name}`}>{p.user.avatar ? <img src={p.user.avatar} alt={p.user.name} /> : p.user.name.slice(0, 1).toUpperCase()}</span>)}{readers.length > 8 && <small>+{readers.length - 8}</small>}</div>}
          </article>;
        })}
        {(pending[channel] || []).map(p => <article key={p.key} className={`${styles.message} ${styles.mine}`}><div className={styles.bubble}><strong>{actor.name}</strong><p>{p.body}</p></div><div className={styles.meta}><time>{time(p.createdAt)}</time>{p.status === "failed" ? <button onClick={() => void send(p, channel)}>Not sent · Retry</button> : <span>Sending…</span>}</div></article>)}
        {!snapshot.items.length && !(pending[channel] || []).length && <p className={styles.empty}>Start the conversation.</p>}
      </div>
      {newMessages && <button className={styles.newMessages} onClick={jump}>Jump to latest</button>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {channel && <form className={styles.composer} onSubmit={event => { event.preventDefault(); const body = (drafts[channel] || "").trim(); if (!body) return; setDrafts(old => ({ ...old, [channel]: "" })); nearBottom.current = true; void send({ key: crypto.randomUUID(), body, status: "sending", createdAt: new Date().toISOString() }, channel); requestAnimationFrame(jump); }}>
        <textarea aria-label="Message" maxLength={4000} placeholder="Write a message…" value={drafts[channel] || ""} onChange={event => setDrafts(old => ({ ...old, [channel]: event.target.value }))} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && matchMedia("(pointer:fine)").matches) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
        <button disabled={!(drafts[channel] || "").trim()}>Send</button>
      </form>}
    </div>
  </section>;
}
