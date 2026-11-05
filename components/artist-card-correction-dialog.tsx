"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, Instagram, LoaderCircle, Music2, Search, X } from "lucide-react";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";
import { customerMessage } from "@/lib/customer-message";
import { instagramProfilePattern } from "@/lib/validation";
import { normalizeArtistCardName } from "@/lib/artist-profile-correction";
import type { ArtistProfile } from "@/lib/types";

type CardResponse = { artists: ArtistProfile[] };
type SocialFields = { instagramUrl: string; spotifyUrl: string; appleUrl: string; youtubeUrl: string };
const emptySocials: SocialFields = { instagramUrl: "", spotifyUrl: "", appleUrl: "", youtubeUrl: "" };

function socials(profile: ArtistProfile): SocialFields {
  return { instagramUrl: profile.instagramUrl || "", spotifyUrl: profile.spotifyUrl || "", appleUrl: profile.appleUrl || "", youtubeUrl: profile.youtubeUrl || "" };
}

export function ArtistCardCorrectionDialog({ creditedArtist, onClose, onSaved }: { creditedArtist: string; onClose: () => void; onSaved: (profile: ArtistProfile) => void }) {
  const [cards, setCards] = useState<ArtistProfile[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<SocialFields>(emptySocials);
  const [original, setOriginal] = useState<SocialFields>(emptySocials);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = cards.find(card => card.id === selectedId) ?? null;
  const exactName = normalizeArtistCardName(creditedArtist);
  const dirty = (Object.keys(form) as (keyof SocialFields)[]).some(key => form[key].trim() !== original[key].trim());
  function close() {
    if (saving || dirty && !window.confirm("Discard your unsaved artist card changes?")) return;
    onClose();
  }
  const dialogRef = useAccessibleDialog(true, close);
  const filteredCards = useMemo(() => cards.filter(card => card.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [cards, query]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let active = true;
    fetch("/api/artists", { cache: "no-store" }).then(async response => {
      const data = await response.json() as CardResponse & { error?: string };
      if (!response.ok) throw new Error(customerMessage(data.error || "Artist cards could not be loaded."));
      if (!active) return;
      const activeCards = (data.artists || []).filter(card => !card.archivedAt);
      setCards(activeCards);
      const exact = activeCards.filter(card => normalizeArtistCardName(card.name) === exactName);
      if (exact.length === 1) {
        setSelectedId(exact[0].id);
        setForm(socials(exact[0]));
        setOriginal(socials(exact[0]));
      }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Artist cards could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; document.body.style.overflow = previousOverflow; };
  }, [exactName]);

  function selectCard(profile: ArtistProfile) {
    if (dirty && !window.confirm("Discard your unsaved artist card changes?")) return;
    setSelectedId(profile.id);
    setForm(socials(profile));
    setOriginal(socials(profile));
    setError("");
    setNotice("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving) return;
    const instagram = form.instagramUrl.trim();
    if (!instagram || !instagramProfilePattern.test(instagram)) {
      setError("Add a valid Instagram profile link or @handle to continue.");
      return;
    }
    const patch = Object.fromEntries((Object.keys(form) as (keyof SocialFields)[]).filter(key => form[key].trim() !== original[key].trim()).map(key => [key, form[key].trim()]));
    if (!Object.keys(patch).length) {
      setNotice("Instagram is already saved. HYMN left your release credit unchanged.");
      onSaved(selected);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/artists/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const data = await response.json() as { profile?: ArtistProfile; error?: string };
      if (!response.ok || !data.profile) throw new Error(customerMessage(data.error || "Artist card could not be updated."));
      if (data.profile.id !== selected.id || data.profile.name !== selected.name) throw new Error("The saved artist identity changed. Refresh the card list before continuing.");
      setCards(current => current.map(card => card.id === data.profile!.id ? data.profile! : card));
      setForm(socials(data.profile));
      setOriginal(socials(data.profile));
      setNotice("HYMN saved this artist card. Your release credit is unchanged.");
      onSaved(data.profile);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Artist card could not be updated.");
    } finally { setSaving(false); }
  }

  return createPortal(<div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section ref={dialogRef as React.RefObject<HTMLElement>} role="dialog" aria-modal="true" aria-labelledby="artist-card-dialog-title" tabIndex={-1} aria-busy={loading || saving} className="flex max-h-[min(92dvh,820px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}>
      <header className="flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-7 sm:py-5" style={{ borderColor: "var(--border)" }}>
        <div><p className="text-xs font-semibold uppercase tracking-[.16em]" style={{ color: "var(--text-soft)" }}>HYMN artist cards</p><h2 id="artist-card-dialog-title" className="mt-1 text-xl font-semibold sm:text-2xl">Review artist details</h2><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Add Instagram for <strong>{creditedArtist}</strong>. Release credits stay unchanged.</p></div>
        <button type="button" aria-label="Close artist card editor" disabled={saving} onClick={close} className="rounded-full p-2 hover:bg-[var(--bg-soft)]"><X size={20}/></button>
      </header>
      <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(220px,.8fr),minmax(0,1.4fr)] md:overflow-hidden">
        <aside className="min-h-0 border-b p-4 md:overflow-y-auto md:border-b-0 md:border-r sm:p-5" style={{ borderColor: "var(--border)" }}>
          <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Saved artist cards</h3><span className="text-xs" style={{ color: "var(--text-soft)" }}>{cards.length}</span></div>
          <label className="mb-3 flex items-center gap-2 border-b px-1 py-2" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}><Search size={15}/><input aria-label="Search saved artist cards" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find an artist" className="min-w-0 flex-1 bg-transparent text-sm outline-none"/></label>
          {loading ? <p className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--text-muted)" }}><LoaderCircle size={16} className="animate-spin"/>Loading cards…</p> : null}
          {!loading && error ? <p role="alert" className="py-5 text-sm" style={{ color: "var(--danger)" }}>{error}</p> : null}
          {!loading && !error && cards.length === 0 ? <p className="py-5 text-sm" style={{ color: "var(--text-muted)" }}>No active artist cards were found on this account.</p> : null}
          {!loading && cards.length > 0 && filteredCards.length === 0 ? <p className="py-5 text-sm" style={{ color: "var(--text-muted)" }}>No cards match that search.</p> : null}
          <div className="grid gap-1">{filteredCards.map(card => {
            const exact = normalizeArtistCardName(card.name) === exactName;
            return <button key={card.id} type="button" aria-pressed={selectedId === card.id} onClick={() => selectCard(card)} className="flex min-h-12 items-center gap-3 border-b px-2 py-2 text-left" style={{ borderColor: "var(--border)", background: selectedId === card.id ? "var(--bg-soft)" : "transparent" }}>
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full" style={{ background: "var(--bg-soft)" }}>{card.imageUrl ? <Image src={card.imageUrl} alt="" width={36} height={36} unoptimized className="h-full w-full object-cover"/> : <Music2 size={16}/>}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{card.name}</span><span className="block truncate text-xs" style={{ color: card.instagramUrl ? "var(--text-soft)" : "var(--warning)" }}>{card.instagramUrl ? "Instagram added" : "Instagram missing"}{exact ? " · Name match" : ""}</span></span>
              {selectedId === card.id ? <Check size={16}/> : null}
            </button>;
          })}</div>
          {!loading && cards.length > 0 && !cards.some(card => normalizeArtistCardName(card.name) === exactName) ? <p className="mt-3 text-xs leading-5" style={{ color: "var(--text-muted)" }}>No exact name match. Select only the saved card that belongs to this credited artist. Do not rename release credits.</p> : null}
        </aside>
        <section className="min-h-0 p-4 sm:p-7 md:overflow-y-auto">
          {!selected ? <div className="grid min-h-48 place-content-center text-center"><p className="font-medium">Choose an artist card to review</p><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>The artist name is protected while you update its profile links.</p></div> : <form onSubmit={save} className="grid gap-5">
            <div><p className="text-xs font-semibold uppercase tracking-[.14em]" style={{ color: "var(--text-soft)" }}>Identity</p><label className="mt-2 block text-sm font-medium" htmlFor="artist-card-name">Artist name</label><input id="artist-card-name" readOnly value={selected.name} className="mt-1 w-full border-b bg-transparent px-1 py-3 text-base font-semibold" style={{ borderColor: "var(--border)", color: "var(--text)" }}/><p className="mt-1 text-xs" style={{ color: "var(--text-soft)" }}>Names on the release and saved card are not changed here.</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[.14em]" style={{ color: "var(--text-soft)" }}>Profile links</p><div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium sm:col-span-2" htmlFor="artist-card-instagram"><span className="flex items-center gap-2"><Instagram size={15}/>Instagram <span className="text-xs font-normal" style={{ color: "var(--warning)" }}>Required for this correction</span></span><input id="artist-card-instagram" data-autofocus className="min-h-11 border-b bg-transparent px-1 text-sm outline-none focus:border-[var(--accent)]" style={{ borderColor: "var(--border)" }} value={form.instagramUrl} onChange={event => setForm(current => ({ ...current, instagramUrl: event.target.value }))} placeholder="@handle or instagram.com/handle" maxLength={500} aria-invalid={Boolean(error && (!form.instagramUrl.trim() || !instagramProfilePattern.test(form.instagramUrl.trim())))}/></label>
              {([["spotifyUrl", "Spotify artist URL"], ["appleUrl", "Apple Music URL"], ["youtubeUrl", "YouTube channel URL"]] as const).map(([field, label]) => <label key={field} className="grid gap-1 text-sm font-medium" htmlFor={`artist-card-${field}`}>{label}<input id={`artist-card-${field}`} className="min-h-10 border-b bg-transparent px-1 text-sm font-normal outline-none focus:border-[var(--accent)]" style={{ borderColor: "var(--border)" }} value={form[field]} onChange={event => setForm(current => ({ ...current, [field]: event.target.value }))} placeholder="Optional" maxLength={500}/></label>)}
            </div></div>
            {error ? <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>{error}</p> : null}{notice ? <p role="status" className="text-sm" style={{ color: "var(--success)" }}>{notice}</p> : null}
            <p className="text-xs" style={{ color: "var(--text-soft)" }}>Saving a profile link refreshes HYMN’s artist identity check before the release is resubmitted.</p>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}><button type="button" className="inline-flex items-center gap-2 text-sm" onClick={() => { if (dirty && !window.confirm("Discard your unsaved artist card changes?")) return; setSelectedId(null); setNotice(""); setError(""); }}><ArrowLeft size={16}/>All cards</button><button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50" style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}>{saving ? <><LoaderCircle size={16} className="animate-spin"/>Saving…</> : <>Save artist card <ArrowRight size={16}/></>}</button></div>
          </form>}
        </section>
      </div>
    </section>
  </div>, document.body);
}
