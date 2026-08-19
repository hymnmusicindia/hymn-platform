"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { DIRENOTE_GENRES, DIRENOTE_SUBGENRES_BY_GENRE } from "@/lib/direnote-config";

export const genreCatalog = DIRENOTE_GENRES.map((genre) => ({ genre, subgenres: DIRENOTE_SUBGENRES_BY_GENRE[genre] ?? ["Other"] }));

type GenreSelectorProps = {
  genre: string;
  subgenre: string;
  onChange: (genre: string, subgenre: string) => void;
  error?: boolean;
};

export function GenreSelector({ genre, subgenre, onChange, error = false }: GenreSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return genreCatalog;

    return genreCatalog.filter((entry) => {
      if (entry.genre.toLowerCase().includes(normalized)) return true;
      return entry.subgenres.some((item) => item.toLowerCase().includes(normalized));
    });
  }, [query]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="field flex min-h-[52px] items-center justify-between gap-4 text-left"
        style={error ? { borderColor: "var(--danger)", boxShadow: "0 0 0 1px var(--danger-soft)" } : undefined}
      >
        <span>
          {genre ? `${genre}${subgenre ? ` / ${subgenre}` : ""}` : "Choose genre and subgenre"}
        </span>
        <span style={{ color: "var(--text-soft)" }}>{open ? "Hide" : "Browse"}</span>
      </button>

      {open ? (
        <div className="absolute z-30 mt-3 w-full rounded-[1.5rem] border p-4 shadow-2xl" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-soft)" }} />
            <input className="field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search genres or subgenres" />
          </div>

          <div className="mt-4 grid gap-3">
            {filtered.map((entry) => (
              <div key={entry.genre} className="rounded-[1.3rem] border p-4" style={{ borderColor: genre === entry.genre ? "var(--accent)" : "var(--border)", background: genre === entry.genre ? "var(--accent-soft)" : "var(--bg-soft)" }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button type="button" className="text-left text-base font-semibold" style={{ color: "var(--text)" }} onClick={() => onChange(entry.genre, "")}>
                    {entry.genre}
                  </button>
                  {genre === entry.genre ? <span className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}>Selected</span> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {entry.subgenres.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        onChange(entry.genre, item);
                        setOpen(false);
                      }}
                      className="rounded-full border px-3 py-1.5 text-xs"
                      style={genre === entry.genre && subgenre === item ? { borderColor: "var(--accent)", background: "var(--card)", color: "var(--text)" } : { borderColor: "var(--border)", color: "var(--text-soft)" }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}


// vercel trigger

// vercel trigger
