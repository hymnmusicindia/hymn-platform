"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DIRENOTE_GENRES, DIRENOTE_SUBGENRES_BY_GENRE } from "@/lib/direnote-config";

export const genreCatalog = DIRENOTE_GENRES.map((genre) => ({
  genre,
  subgenres: DIRENOTE_SUBGENRES_BY_GENRE[genre] ?? ["Other"],
}));

type GenreSelectorProps = {
  genre: string;
  subgenre: string;
  onChange: (genre: string, subgenre: string) => void;
  error?: boolean;
};

export function GenreSelector({ genre, subgenre, onChange, error = false }: GenreSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGenre, setActiveGenre] = useState(() => genre || genreCatalog[0]?.genre || "");
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(
    () => genreCatalog.filter((entry) => !normalized || entry.genre.toLowerCase().includes(normalized) || entry.subgenres.some((item) => item.toLowerCase().includes(normalized))),
    [normalized],
  );
  const activeEntry = filtered.find((entry) => entry.genre === activeGenre) ?? filtered[0] ?? null;
  const visibleSubgenres = activeEntry?.subgenres.filter((item) => !normalized || activeEntry.genre.toLowerCase().includes(normalized) || item.toLowerCase().includes(normalized)) ?? [];

  function openPicker() {
    setActiveGenre(genre || genreCatalog[0]?.genre || "");
    setOpen(true);
  }

  function closePicker() {
    setOpen(false);
    setQuery("");
  }

  const picker = open ? (
    <div className="genre-picker-backdrop fixed inset-0 z-[120] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) closePicker(); }}>
      <section role="dialog" aria-modal="true" aria-label="Choose genre and subgenre" className="genre-picker-modal flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[1.5rem] border shadow-2xl sm:max-w-3xl sm:rounded-[1.5rem]" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
        <header className="flex items-center justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="font-semibold" style={{ color: "var(--text)" }}>Genre and subgenre</h3>
          <button type="button" onClick={closePicker} aria-label="Close genre picker" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-soft)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
        </header>
        <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
          <label className="relative block"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-soft)" }} /><input className="field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search genres or subgenres" autoFocus /></label>
        </div>
        {activeEntry ? (
          <div className="grid min-h-0 flex-1 grid-rows-[160px,minmax(0,1fr)] sm:grid-cols-[minmax(160px,.72fr),minmax(0,1.28fr)] sm:grid-rows-1">
            <nav aria-label="Genres" className="overflow-y-auto border-b p-2 sm:border-b-0 sm:border-r" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-1">{filtered.map((entry) => { const active = entry.genre === activeEntry.genre; return <button key={entry.genre} type="button" onClick={() => setActiveGenre(entry.genre)} className="flex min-h-10 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition" style={active ? { background: "var(--card)", color: "var(--text)" } : { color: "var(--text-muted)" }}><span className="truncate">{entry.genre}</span><span className="text-[9px]" style={{ color: "var(--text-soft)" }}>{entry.subgenres.length}</span></button>; })}</div>
            </nav>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
              <h4 className="text-lg font-semibold" style={{ color: "var(--text)" }}>{activeEntry.genre}</h4>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">{visibleSubgenres.map((item) => { const selected = genre === activeEntry.genre && subgenre === item; return <button key={item} type="button" onClick={() => { onChange(activeEntry.genre, item); closePicker(); }} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition" style={selected ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--text)" } : { borderColor: "var(--border)", background: "transparent", color: "var(--text-muted)" }}><span>{item}</span>{selected ? <Check className="h-4 w-4 text-[var(--accent)]" /> : null}</button>; })}</div>
            </div>
          </div>
        ) : <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>No matching genres found.</div>}
      </section>
    </div>
  ) : null;

  return <div>
    <button type="button" onClick={openPicker} aria-expanded={open} className="field flex min-h-[58px] items-center justify-between gap-4 text-left" style={error ? { borderColor: "var(--danger)", boxShadow: "0 0 0 1px var(--danger-soft)" } : genre ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : undefined}>
      <span className="min-w-0"><strong className="block truncate text-sm" style={{ color: "var(--text)" }}>{genre ? `${genre}${subgenre ? ` · ${subgenre}` : ""}` : "Choose genre and subgenre"}</strong></span>
      <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "var(--text-soft)" }} />
    </button>
    {picker && typeof document !== "undefined" ? createPortal(picker, document.body) : null}
  </div>;
}

// vercel trigger 12
