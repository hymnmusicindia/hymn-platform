"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

export const moodGroups = [
  ["Calm & Relaxing", ["Chill", "Relaxed", "Peaceful", "Soft", "Mellow", "Soothing", "Serene"]],
  ["Atmospheric", ["Ambient", "Dreamy", "Ethereal", "Mysterious", "Cinematic"]],
  ["Energetic & Powerful", ["Energetic", "Powerful", "Intense", "Aggressive", "Epic", "Dark"]],
  ["Emotional", ["Happy", "Sad", "Romantic", "Melancholic", "Heartbreak", "Nostalgic", "Hopeful"]],
  ["Positive & Inspirational", ["Uplifting", "Motivational", "Inspirational", "Spiritual", "Empowering"]],
  ["Party & Club", ["Dance", "Club", "Party", "Groovy", "Bouncy", "Fun", "High Energy"]],
  ["Street / Hip-Hop", ["Raw", "Gritty", "Gangsta", "Drill", "Trap", "Confident", "Flex"]],
  ["Experimental", ["Abstract", "Alternative", "Psychedelic", "Futuristic", "Experimental"]],
] as const;

export function MoodSelector({ value, onChange, error = false }: { value: string; onChange: (value: string) => void; error?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedGroup = moodGroups.find(([, moods]) => moods.some((mood) => mood === value))?.[0];
  const [activeGroup, setActiveGroup] = useState<string>(selectedGroup ?? moodGroups[0][0]);
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(
    () => moodGroups.map(([group, moods]) => ({ group, moods: moods.filter((mood) => !normalized || group.toLowerCase().includes(normalized) || mood.toLowerCase().includes(normalized)) })).filter((entry) => entry.moods.length),
    [normalized],
  );
  const activeEntry = filtered.find((entry) => entry.group === activeGroup) ?? filtered[0] ?? null;

  function openPicker() {
    setActiveGroup(selectedGroup ?? moodGroups[0][0]);
    setOpen(true);
  }

  function closePicker() {
    setOpen(false);
    setQuery("");
  }

  const picker = open ? (
    <div className="genre-picker-backdrop fixed inset-0 z-[120] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) closePicker(); }}>
      <section role="dialog" aria-modal="true" aria-label="Choose a mood" className="genre-picker-modal flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[1.5rem] border shadow-2xl sm:max-w-3xl sm:rounded-[1.5rem]" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
        <header className="flex items-center justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="font-semibold" style={{ color: "var(--text)" }}>Choose a mood</h3>
          <button type="button" onClick={closePicker} aria-label="Close mood picker" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-soft)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
        </header>
        <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
          <label className="relative block"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-soft)" }} /><input autoFocus className="field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search moods" /></label>
        </div>
        {activeEntry ? (
          <div className="grid min-h-0 flex-1 grid-rows-[160px,minmax(0,1fr)] sm:grid-cols-[minmax(180px,.8fr),minmax(0,1.2fr)] sm:grid-rows-1">
            <nav aria-label="Mood families" className="overflow-y-auto border-b p-2 sm:border-b-0 sm:border-r" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-1">{filtered.map((entry) => { const active = entry.group === activeEntry.group; return <button key={entry.group} type="button" onClick={() => setActiveGroup(entry.group)} className="flex min-h-10 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition" style={active ? { background: "var(--card)", color: "var(--text)" } : { color: "var(--text-muted)" }}><span className="truncate">{entry.group}</span><span className="text-[9px]" style={{ color: "var(--text-soft)" }}>{entry.moods.length}</span></button>; })}</div>
            </nav>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
              <h4 className="text-lg font-semibold" style={{ color: "var(--text)" }}>{activeEntry.group}</h4>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">{activeEntry.moods.map((mood) => { const selected = value === mood; return <button key={mood} type="button" onClick={() => { onChange(mood); closePicker(); }} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition" style={selected ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--text)" } : { borderColor: "var(--border)", background: "transparent", color: "var(--text-muted)" }}><span>{mood}</span>{selected ? <Check className="h-4 w-4 text-[var(--accent)]" /> : null}</button>; })}</div>
            </div>
          </div>
        ) : <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>No matching moods found.</div>}
      </section>
    </div>
  ) : null;

  return <div>
    <button type="button" onClick={openPicker} aria-expanded={open} className="field flex min-h-[58px] items-center justify-between gap-4 text-left" style={error ? { borderColor: "var(--danger)", boxShadow: "0 0 0 1px var(--danger-soft)" } : value ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : undefined}>
      <span className="min-w-0"><strong className="block truncate text-sm" style={{ color: "var(--text)" }}>{value || "Choose a mood"}</strong></span>
      <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "var(--text-soft)" }} />
    </button>
    {picker && typeof document !== "undefined" ? createPortal(picker, document.body) : null}
  </div>;
}

// vercel trigger 12
