"use client";
import { useEffect, useState } from "react";
export function AccountHandle({ compact = false }: { compact?: boolean }) {
    const [tag, setTag] = useState("");
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState("");
    const [digits, setDigits] = useState("");
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => { let alive = true; fetch("/api/user/handle", { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject()).then(r => { if (alive)
        setTag(r.tag); }).catch(() => { if (alive)
        setMessage("Handle unavailable. Reopen your profile to retry."); }); return () => { alive = false; }; }, []);
    function edit() { const [n, d] = tag.slice(1).split("#"); setName(n || ""); setDigits(d || ""); setEditing(true); setMessage(""); }
    async function save() { setBusy(true); setMessage(""); try {
        const r = await fetch("/api/user/handle", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag: `@${name}#${digits}` }) });
        const result = await r.json();
        if (!r.ok)
            throw new Error(result.error);
        setTag(result.tag);
        setEditing(false);
        setMessage("Handle saved. Existing split invitations stay linked to your account.");
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : "Could not save. Try again.");
    }
    finally {
        setBusy(false);
    } }
    return <div className={compact ? "account-handle compact text-xs" : "account-handle mt-3 text-xs"}><div className="flex flex-wrap items-center gap-2"><button type="button" title="Copy your unique artist handle" className="rounded-full border px-2.5 py-1 font-semibold" style={{ borderColor: "var(--border)", color: "var(--text)" }} disabled={!tag} onClick={() => { (navigator.clipboard?.writeText(tag) ?? Promise.reject()).then(() => setMessage("Handle copied."), () => setMessage(tag)); }}>{tag || "Your artist handle"}</button><button type="button" onClick={edit} className="text-xs underline underline-offset-4">Edit</button></div>{editing ? <form className="mt-3 grid gap-2" onSubmit={e => { e.preventDefault(); void save(); }}><label>Handle name<input className="field mt-1 w-full" autoFocus value={name} minLength={3} maxLength={24} pattern="[a-zA-Z0-9][a-zA-Z0-9_.]{2,23}" onChange={e => setName(e.target.value)} required/></label><label>Four-digit number<input className="field mt-1 w-full" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} value={digits} onChange={e => setDigits(e.target.value)} required/></label><p style={{ color: "var(--text-muted)" }}>Others can invite you using @{name || "artist"}#{digits || "1234"}. Your previous handle stays reserved to you.</p><div className="flex gap-2"><button disabled={busy} className="btn-primary px-3 py-2">{busy ? "Saving..." : "Save handle"}</button><button type="button" disabled={busy} onClick={() => setEditing(false)} className="btn-outline px-3 py-2">Cancel</button></div></form> : null}{message ? <p role="status" className="mt-2" style={{ color: "var(--text-muted)" }}>{message}</p> : null}</div>;
}
