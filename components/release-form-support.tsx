"use client";

import clsx from "clsx";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, ChevronDown, Clock3, Disc3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { contributorRoles, countryOptions, legalGroups } from "@/lib/release-config";
import type { Release } from "@/lib/types";

export type ContributorDraft = { id: string; legalName: string; artistName: string; ipi?: string; iprsMember?: boolean; instagramUrl?: string; xUrl?: string };

export type ContributorModalState = {
  open: boolean;
  trackIndex: number | null;
  songwriters: ContributorDraft[];
  composers: ContributorDraft[];
  producers: ContributorDraft[];
};

function ModalShell({
  open,
  onClose,
  maxWidthClass,
  children
}: {
  open: boolean;
  onClose: () => void;
  maxWidthClass: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-6 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={clsx("w-full", maxWidthClass)} onMouseDown={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function CountrySelector({
  selected,
  onChange,
  showError,
  registerField,
  shaking
}: {
  selected: string[];
  onChange: (countries: string[]) => void;
  showError: boolean;
  registerField: (node: HTMLButtonElement | null) => void;
  shaking: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => countryOptions.filter((country) => country.toLowerCase().includes(query.trim().toLowerCase())),
    [query]
  );

  return (
    <div className="relative">
      <button
        ref={registerField}
        type="button"
        className={clsx("field flex min-h-[52px] w-full items-center justify-between text-left", showError ? "field-invalid" : "", shaking ? "field-shake" : "")}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{selected.length === 0 ? "No restricted countries" : `${selected.length} restricted`}</span>
        <span style={{ color: "var(--text-soft)" }}>{open ? "Hide" : "Choose"}</span>
      </button>
      {selected.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {selected.map((country) => (
            <button
              key={country}
              type="button"
              className="rounded-full border px-3 py-1.5 text-xs transition hover:-translate-y-0.5"
              style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--text)" }}
              onClick={() => onChange(selected.filter((item) => item !== country))}
              aria-label={`Remove ${country} from restricted countries`}
            >
              {country} x
            </button>
          ))}
        </div>
      ) : null}
      {open ? (
        <div className="absolute z-20 mt-2 w-full rounded-[1.4rem] border p-3 shadow-2xl" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search countries" />
          <div className="mt-3 flex flex-wrap gap-2">
            {filtered.map((country) => {
              const active = selected.includes(country);
              return (
                <button key={country} type="button" className="rounded-full border px-3 py-1.5 text-xs transition-transform duration-200 hover:scale-[1.02]" style={active ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--text)" } : { borderColor: "var(--border)", color: "var(--text-muted)" }} onClick={() => onChange(active ? selected.filter((item) => item !== country) : [...selected, country])}>
                  {country}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ContributorsModal({
  state,
  onClose,
  onSave,
  createContributor,
  contributorsValid
}: {
  state: ContributorModalState;
  onClose: () => void;
  onSave: (value: { songwriters: ContributorDraft[]; composers: ContributorDraft[]; producers: ContributorDraft[] }) => void;
  createContributor: () => ContributorDraft;
  contributorsValid: (entries: ContributorDraft[]) => boolean;
}) {
  const [local, setLocal] = useState({ songwriters: [createContributor()], composers: [createContributor()], producers: [createContributor()] });

  useEffect(() => {
    if (!state.open) return;
    setLocal({ songwriters: state.songwriters, composers: state.composers, producers: state.producers });
  }, [state]);

  if (!state.open) return null;

  function updateRole(role: "songwriters" | "composers" | "producers", id: string, patch: Partial<ContributorDraft>) {
    setLocal((current) => ({ ...current, [role]: current[role].map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) }));
  }

  function addRoleEntry(role: "songwriters" | "composers" | "producers") {
    setLocal((current) => ({ ...current, [role]: [...current[role], createContributor()] }));
  }

  function removeRoleEntry(role: "songwriters" | "composers" | "producers", id: string) {
    setLocal((current) => ({ ...current, [role]: current[role].length === 1 ? current[role] : current[role].filter((entry) => entry.id !== id) }));
  }

  const valid = [local.songwriters, local.composers, local.producers].every(contributorsValid);
  const totalContributors = local.songwriters.length + local.composers.length + local.producers.length;

  return (
    <ModalShell open={state.open} onClose={onClose} maxWidthClass="max-w-4xl">
      <div className="flex max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-[1.4rem] border shadow-2xl" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
        <div className="flex flex-col gap-4 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6" style={{ borderColor: "var(--border)", background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, var(--bg-soft)), var(--bg-soft))" }}>
          <div>
            <p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>Credits & rights</p>
            <h3 className="mt-1 text-xl font-semibold sm:text-2xl" style={{ color: "var(--text)" }}>Contributors</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Add legal names for royalty and rights matching. Artist names can stay optional.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: valid ? "rgba(34,197,94,0.38)" : "rgba(250,204,21,0.38)", background: valid ? "rgba(34,197,94,0.1)" : "rgba(250,204,21,0.1)", color: valid ? "#86efac" : "#fde68a" }}>
              {valid ? "Ready" : "Needs names"}
            </span>
            <span className="rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}>{totalContributors} total</span>
            <button type="button" className="btn-outline pressable px-3 py-2 text-sm" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="grid flex-1 gap-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {contributorRoles.map((role) => {
            const key = `${role.key}s` as "songwriters" | "composers" | "producers";
            const entries = local[key];
            const complete = contributorsValid(entries);
            const initials = role.label.slice(0, 1);
            return (
              <div key={role.key} className="rounded-[1.15rem] border p-3 sm:p-4" style={{ borderColor: complete ? "color-mix(in srgb, var(--accent) 28%, var(--border))" : "rgba(250,204,21,0.34)", background: "var(--bg-soft)" }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-semibold" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}>{initials}</span>
                    <div>
                      <h4 className="text-base font-semibold" style={{ color: "var(--text)" }}>{role.label}</h4>
                      <p className="text-xs" style={{ color: "var(--text-soft)" }}>{entries.length} entr{entries.length === 1 ? "y" : "ies"} · legal name required</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={complete ? { borderColor: "rgba(34,197,94,0.4)", color: "#86efac", background: "rgba(34,197,94,0.09)" } : { borderColor: "rgba(250,204,21,0.38)", color: "#fde68a", background: "rgba(250,204,21,0.09)" }}>
                      {complete ? "Complete" : "Missing"}
                    </span>
                    <button type="button" className="btn-outline pressable px-3 py-2 text-xs" onClick={() => addRoleEntry(key)}>+ Add</button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  {entries.map((entry, entryIndex) => (
                    <div key={entry.id} className="grid gap-2 rounded-xl border p-2.5 sm:grid-cols-[auto,1fr,1fr,auto] sm:items-center" style={{ borderColor: entry.legalName.trim() ? "var(--border)" : "rgba(250,204,21,0.36)", background: "var(--card)" }}>
                      <span className="hidden h-8 w-8 items-center justify-center rounded-lg border text-xs font-semibold sm:inline-flex" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}>{entryIndex + 1}</span>
                      <label className="grid gap-1">
                        <span className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Legal name</span>
                        <input className="field min-h-10 py-2 text-sm" placeholder="Full legal name" value={entry.legalName} onChange={(event) => updateRole(key, entry.id, { legalName: event.target.value })} />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Artist name</span>
                        <input className="field min-h-10 py-2 text-sm" placeholder="Optional public credit" value={entry.artistName} onChange={(event) => updateRole(key, entry.id, { artistName: event.target.value })} />
                      </label>
                      {role.key !== "producer" ? <div className="col-span-full grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><label className="grid gap-1"><span className="text-[11px] uppercase tracking-[0.16em]" style={{color:"var(--text-soft)"}}>IPI number</span><input className="field min-h-10 py-2 text-sm" value={entry.ipi ?? ""} onChange={(event)=>updateRole(key,entry.id,{ipi:event.target.value})} placeholder="Optional" /></label><label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" checked={Boolean(entry.iprsMember)} onChange={(event)=>updateRole(key,entry.id,{iprsMember:event.target.checked})} />IPRS member</label><label className="grid gap-1"><span className="text-[11px] uppercase tracking-[0.16em]" style={{color:"var(--text-soft)"}}>Instagram</span><input className="field min-h-10 py-2 text-sm" value={entry.instagramUrl ?? ""} onChange={(event)=>updateRole(key,entry.id,{instagramUrl:event.target.value})} placeholder="Optional URL" /></label><label className="grid gap-1"><span className="text-[11px] uppercase tracking-[0.16em]" style={{color:"var(--text-soft)"}}>X / Twitter</span><input className="field min-h-10 py-2 text-sm" value={entry.xUrl ?? ""} onChange={(event)=>updateRole(key,entry.id,{xUrl:event.target.value})} placeholder="Optional URL" /></label></div> : null}
                      <button type="button" className="btn-outline pressable px-3 py-2 text-xs" disabled={entries.length === 1} onClick={() => removeRoleEntry(key, entry.id)}>Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {!valid ? <p className="px-4 pb-0 text-sm sm:px-6" style={{ color: "#fca5a5" }}>Each contributor role needs at least one legal name.</p> : null}
        <div className="flex flex-col-reverse gap-2 border-t px-4 py-4 sm:flex-row sm:justify-end sm:px-6" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <button type="button" className="btn-outline pressable justify-center" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary pressable justify-center" disabled={!valid} onClick={() => onSave(local)}>Save contributors</button>
        </div>
      </div>
    </ModalShell>
  );
}

const monetisationClauses = [
  {
    key: "exclusiveRights",
    title: "Exclusive rights",
    body: "I confirm that I have exclusive rights to this content.",
    notes: [
      "Cover songs without licenses",
      "Content licensed non-exclusively from a third party (e.g., Beatstars or YouTube instrumentals, Splice samples)",
      "Royalty-free samples and loops",
      "Non-individual loops",
      "Content released under Creative Commons or similar free/open licenses",
      "Public domain outputs, recordings, or compositions, including classical music",
      "Clips from other sources (e.g., video games, movies, TV, YouTube videos)"
    ]
  },
  {
    key: "distinctReference",
    title: "Distinct reference content",
    body: "I confirm that my content is sufficiently distinct.",
    notes: [
      "Karaoke recordings, remasters, sound-alike recordings, live versions that are not distinct from the original version, and dubbed content",
      "Sound effects, soundboards, or production loops (e.g., audience applause, white noise, drum loops)"
    ]
  },
  {
    key: "singleDistinctPiece",
    title: "A single distinct piece",
    body: "I confirm that my content is a single, distinct recording.",
    notes: [
      "Continuous DJ mixes",
      "Mashups",
      "Countdowns",
      "Full album or full compilation recordings",
      "Even if you exclusively own all of the content within these types of recordings in all territories, you must separate them into individual components, songs, or videos."
    ]
  },
  {
    key: "musicalWork",
    title: "Recording of a musical work",
    body: "I confirm that my content is a recording of a musical work.",
    notes: [
      "Audiobooks",
      "ASMR",
      "Podcasts",
      "Speeches",
      "Comedy recordings",
      "Film recordings",
      "Prayers",
      "Video gameplay footage"
    ]
  },
  {
    key: "noOtherMonetization",
    title: "No other monetization service used",
    body: "I confirm that I have not used another tool or company to monetize this content on YouTube Content ID or TikTok.",
    notes: []
  },
  {
    key: "humanCreatedContent",
    title: "Human-Created Content",
    body: "I confirm my content was not fully generated by AI.",
    notes: ["Fully AI-generated content is not eligible."]
  },
  {
    key: "seriousAcknowledgement",
    title: "YouTube and TikTok take these points very seriously.",
    body: "I confirm that my release meets all of the requirements listed above. If my release does not meet these criteria, it may be subject to takedown. My distributor cannot be held responsible for any losses incurred.",
    notes: []
  }
] as const;

export type MonetisationClauseKey = (typeof monetisationClauses)[number]["key"];

export type MonetisationClauseState = Record<MonetisationClauseKey, boolean>;

export function createMonetisationClauseState(): MonetisationClauseState {
  return {
    exclusiveRights: false,
    distinctReference: false,
    singleDistinctPiece: false,
    musicalWork: false,
    noOtherMonetization: false,
    humanCreatedContent: false,
    seriousAcknowledgement: false
  };
}

export function MonetisationConsentModal({
  open,
  onClose,
  onConfirm,
  value,
  onChange
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  value: MonetisationClauseState;
  onChange: (value: MonetisationClauseState) => void;
}) {
  const firstIncompleteIndex = monetisationClauses.findIndex((clause) => !value[clause.key]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const monetisationComplete = monetisationClauses.every((clause) => value[clause.key]);
  const onFinalStep = currentIndex >= monetisationClauses.length;
  const activeClause = monetisationClauses[Math.min(currentIndex, monetisationClauses.length - 1)];
  const progress = onFinalStep ? 100 : Math.round((currentIndex / monetisationClauses.length) * 100);
  const currentClauseAccepted = !onFinalStep && activeClause ? Boolean(value[activeClause.key]) : false;

  useEffect(() => {
    if (!open) return;
    setCurrentIndex(firstIncompleteIndex === -1 ? monetisationClauses.length : Math.max(firstIncompleteIndex, 0));
  }, [firstIncompleteIndex, open]);

  function agreeCurrentClause() {
    if (!activeClause) return;
    onChange({ ...value, [activeClause.key]: true });
    setCurrentIndex((index) => Math.min(index + 1, monetisationClauses.length));
  }

  function goNext() {
    if (!currentClauseAccepted) return;
    setCurrentIndex((index) => Math.min(index + 1, monetisationClauses.length));
  }

  function goBack() {
    setCurrentIndex((index) => Math.max(index - 1, 0));
  }

  return (
    <ModalShell open={open} onClose={onClose} maxWidthClass="max-w-3xl">
      <div className="flex max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-[1.8rem] border shadow-2xl" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
        <div className="flex items-start justify-between gap-4 border-b px-6 py-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <div>
            <p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Monetisation consent</p>
            <h3 className="mt-3 text-2xl font-semibold" style={{ color: "var(--text)" }}>Confirm Content ID and social eligibility</h3>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Review one clause at a time. Each confirmation moves you forward.</p>
          </div>
          <button type="button" className="btn-outline pressable" onClick={onClose}>Close</button>
        </div>
        <div className="grid flex-1 gap-5 overflow-y-auto overscroll-contain px-6 py-5 pr-5">
          <div className="rounded-full border p-1" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <div className="h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: "var(--accent)" }} />
          </div>

          {!onFinalStep ? (
            <div key={activeClause.key} className="clause-slide rounded-[1.45rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>
                  Clause {currentIndex + 1} of {monetisationClauses.length}
                </p>
                <span className="status-pill">{currentClauseAccepted ? "Agreed" : "Pending"}</span>
              </div>
              <h4 className="mt-4 text-2xl font-semibold" style={{ color: "var(--text)" }}>{activeClause.title}</h4>
              <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{activeClause.body}</p>
              {activeClause.notes.length ? (
                <div className="mt-5 rounded-[1.2rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>This excludes</p>
                  <ul className="mt-3 grid gap-2 text-sm leading-5" style={{ color: "var(--text-muted)" }}>
                    {activeClause.notes.map((note) => <li key={note}>- {note}</li>)}
                  </ul>
                </div>
              ) : null}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={onClose} className="btn-outline pressable">
                  I do not agree
                </button>
                {currentClauseAccepted ? (
                  <button type="button" onClick={goNext} className="btn-primary pressable">
                    Next
                  </button>
                ) : (
                  <button type="button" onClick={agreeCurrentClause} className="btn-primary pressable">
                    I agree
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div key="final-agreement" className="clause-slide rounded-[1.45rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Final agreement</p>
              <h4 className="mt-4 text-2xl font-semibold" style={{ color: "var(--text)" }}>All monetisation clauses are agreed.</h4>
              <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                By enabling monetisation, you agree that every clause above is true, that your release is eligible for YouTube Content ID and social monetisation, and that HYMN may submit this content based on your confirmations.
              </p>
              <div className="mt-6 rounded-[1.25rem] border p-4" style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>You agree with HYMN&apos;s monetisation terms and conditions.</p>
                <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-soft)" }}>If you do not agree, monetisation will remain disabled for this release.</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <p className="text-sm" style={{ color: "var(--text-soft)" }}>
            {onFinalStep ? "Enable monetisation to complete this approval popup." : "Agree with the current clause to continue."}
          </p>
          <div className="flex flex-wrap gap-3">
            {currentIndex > 0 ? <button type="button" className="btn-outline pressable" onClick={goBack}>Back</button> : null}
            <button type="button" className="btn-outline pressable" onClick={onClose}>{onFinalStep ? "I do not agree" : "Not now"}</button>
            {onFinalStep ? <button type="button" className="btn-primary pressable" disabled={!monetisationComplete} onClick={onConfirm}>Enable monetisation</button> : null}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

export function LegalConsentModal({
  open,
  onClose,
  onConfirm,
  value,
  onChange
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  value: Record<string, boolean>;
  onChange: (value: Record<string, boolean>) => void;
}) {
  const allAccepted = legalGroups.every((group) => group.items.every(([key]) => Boolean(value[key])));

  return (
    <ModalShell open={open} onClose={onClose} maxWidthClass="max-w-5xl">
      <div className="flex max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-[1.8rem] border shadow-2xl" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
        <div className="flex items-start justify-between gap-4 border-b px-6 py-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <div>
            <p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Final legal confirmations</p>
            <h3 className="mt-3 text-2xl font-semibold" style={{ color: "var(--text)" }}>Review the release legality checklist</h3>
          </div>
          <button type="button" className="btn-outline pressable" onClick={onClose}>Close</button>
        </div>
        <div className="grid flex-1 gap-5 overflow-y-auto overscroll-contain px-6 py-5 pr-5">
          {legalGroups.map((group) => (
            <div key={group.title} className="rounded-[1.45rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{group.title}</p>
              <div className="mt-3 grid gap-2">
                {group.items.map(([key, label]) => {
                  const checked = value[key];
                  return (
                    <label key={key} className="flex items-start gap-3 rounded-xl border px-3 py-2 text-[12px] leading-5" style={checked ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--text)" } : { borderColor: "var(--border)", background: "var(--card)", color: "var(--text-muted)" }}>
                      <input type="checkbox" checked={checked} onChange={(event) => onChange({ ...value, [key]: event.target.checked })} className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <div className="flex items-center gap-3 text-sm" style={{ color: "var(--text-soft)" }}>
            <p>{allAccepted ? "All legal confirmations are complete." : "All legal confirmations must be checked before continuing."}</p>
            {allAccepted ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "rgb(34, 197, 94)" }}>
                <span className="animate-pulse">✓</span>
                Ready
              </span>
            ) : null}
          </div>
          <button type="button" className="btn-outline pressable" onClick={onClose}>Not now</button>
          <button type="button" className={clsx("btn-primary pressable", allAccepted ? "shadow-lg shadow-emerald-500/25" : "")} disabled={!allAccepted} onClick={onConfirm}>I confirm</button>
        </div>
      </div>
    </ModalShell>
  );
}

export function YoutubeContentIdModal({
  open,
  onClose,
  onSave,
  channelUrl,
  onChannelUrlChange
}: {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  channelUrl: string;
  onChannelUrlChange: (value: string) => void;
}) {
  return (
    <ModalShell open={open} onClose={onClose} maxWidthClass="max-w-xl">
      <div className="flex max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-[1.6rem] border shadow-2xl" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <div>
            <p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>YouTube Content ID</p>
            <h3 className="mt-2 text-xl font-semibold" style={{ color: "var(--text)" }}>Register your channel URL</h3>
          </div>
          <button type="button" className="btn-outline pressable" onClick={onClose}>Close</button>
        </div>
        <div className="grid gap-4 px-5 py-5">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Paste the URL of the YouTube channel that should be linked to this release.</p>
          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>Channel URL</span>
            <input className="field" value={channelUrl} onChange={(event) => onChannelUrlChange(event.target.value)} placeholder="https://www.youtube.com/@yourchannel" />
          </label>
          <a href="https://www.youtube.com/watch?v=49RPkZs6DgI" target="_blank" rel="noreferrer" className="text-sm font-medium underline decoration-dotted underline-offset-4" style={{ color: "var(--text)" }}>How to find my channel URL?</a>
        </div>
        <div className="flex items-center justify-end gap-3 border-t px-5 py-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <button type="button" className="btn-outline pressable" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary pressable" onClick={onSave}>Save channel</button>
        </div>
      </div>
    </ModalShell>
  );
}

export function SuccessState({ release, onReset, title = "Your release has been submitted", resetLabel = "Submit another release" }: { release: Release; onReset: () => void; title?: string; resetLabel?: string }) {
  const [openFaq, setOpenFaq] = useState(0);
  const releaseTitle = release.releaseTitle || release.trackName || "GULLAK SAMBHAL";
  const artistName = release.artistName || "HYMN Artist";
  const artworkUrl = release.artworkUrl || "/uploads/site/home-hero/380d946e-e499-4860-a0cd-2f19ba1b258b.png";
  const releaseDate = release.releaseDate
    ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${release.releaseDate}T00:00:00`))
    : "To be confirmed";
  const releaseType = release.releaseType ? `${release.releaseType.charAt(0).toUpperCase()}${release.releaseType.slice(1)}` : "Release";
  const checklist = [
    { label: "Submitted", description: "Your files and metadata have been received.", state: "done" },
    { label: "Review in progress", description: "We are reviewing artwork, audio, metadata, and rights.", state: "active" },
    { label: "Distribution processing", description: "Once approved, your release will be prepared for delivery.", state: "future" },
    { label: "Scheduled / Live", description: "Your release moves into scheduled or live status.", state: "future" }
  ] as const;
  const faqs = [
    {
      question: "How long after submitting will my release go live?",
      answer: "Most releases move through review within 24-48 hours, then store processing time depends on each platform. We will email you when important stages change."
    },
    {
      question: "How do I track my releases?",
      answer: "Open My Releases from your dashboard to see status, metadata, review notes, and live distribution progress for every submitted release."
    },
    {
      question: "Can I update information on a live release?",
      answer: "Yes. Some metadata updates can be submitted after release, but store policies and timing vary. HYMN will guide you through what can be changed safely."
    },
    {
      question: "When do I get paid?",
      answer: "Royalties are reported after platforms send usage and payout data. Your dashboard and royalty payout area will show earnings as they become available."
    }
  ];

  return (
    <section className="hymn-success-page relative isolate overflow-hidden rounded-[1.75rem] border px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div className="relative z-10 mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#59dfe0]">Distribution submission</p>
            <p className="mt-1 text-sm text-[#98a1b3]">Confirmation and next steps</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#59dfe0]/20 bg-[#59dfe0]/[0.07] px-3 py-1.5 text-xs font-semibold text-[#b7f7f7]">
            <Check className="h-3.5 w-3.5" /> Submitted
          </span>
        </header>

        <div className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)] lg:items-start">
          <div className="hymn-success-enter rounded-[1.4rem] border border-white/[0.06] bg-[#0d1118]/80 p-5 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#59dfe0]">Submission successful</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.035em] text-[#f5f7fb] sm:text-4xl">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#98a1b3] sm:text-base">
              Your release is now in HYMN review. We’ll verify metadata, artwork, audio, and rights before moving it forward.
            </p>

            <div className="mt-6 border-t border-white/[0.06] pt-5">
              <h2 className="text-sm font-semibold text-[#f5f7fb]">What happens next</h2>
              <ol className="mt-4 grid gap-0 sm:grid-cols-4">
                {checklist.map((item, index) => (
                  <li key={item.label} className="relative flex gap-3 pb-5 last:pb-0 sm:block sm:pb-0 sm:pr-4">
                    {index < checklist.length - 1 ? <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-white/[0.08] sm:left-8 sm:top-[15px] sm:h-px sm:w-[calc(100%-2rem)]" /> : null}
                    <span className={clsx("relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs", item.state === "done" && "border-[#59dfe0]/40 bg-[#59dfe0]/15 text-[#59dfe0]", item.state === "active" && "border-[#59dfe0] bg-[#59dfe0] text-[#061012] shadow-[0_0_22px_rgba(89,223,224,0.2)]", item.state === "future" && "border-white/10 bg-[#121720] text-[#667085]")}>
                      {item.state === "done" ? <Check className="h-4 w-4" /> : item.state === "active" ? <Clock3 className="h-4 w-4" /> : index + 1}
                    </span>
                    <div className="sm:mt-3">
                      <p className={clsx("text-sm font-semibold", item.state === "future" ? "text-[#737d90]" : "text-[#f5f7fb]")}>{item.label}</p>
                      <p className="mt-1 text-xs leading-5 text-[#7f899b]">{item.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-white/[0.06] pt-5 sm:flex-row">
              <Link href={`/dashboard/releases?releaseId=${release.id}`} className="hymn-success-primary-cta inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold">
                Open release dashboard <ArrowRight className="h-4 w-4" />
              </Link>
              <button type="button" onClick={onReset} className="hymn-success-secondary-cta inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold">{resetLabel}</button>
            </div>
          </div>

          <aside className="hymn-success-enter-delayed rounded-[1.4rem] border border-white/[0.07] bg-[#0d1118]/90 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.25)]">
            <div className="flex gap-4 lg:block">
              <img src={artworkUrl} alt={`${releaseTitle} artwork`} className="h-24 w-24 shrink-0 rounded-xl border border-white/[0.08] object-cover lg:h-auto lg:w-full lg:aspect-square" />
              <div className="min-w-0 lg:mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#59dfe0]">Release summary</p>
                <h2 className="mt-2 truncate text-xl font-semibold tracking-[-0.02em] text-[#f5f7fb]">{releaseTitle}</h2>
                <p className="mt-1 truncate text-sm text-[#98a1b3]">{artistName}</p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[0.06] pt-4 text-sm">
              <div><dt className="text-xs text-[#707a8c]">Format</dt><dd className="mt-1 text-[#e9edf4]">{releaseType}</dd></div>
              <div><dt className="text-xs text-[#707a8c]">Status</dt><dd className="mt-1 text-[#b7f7f7]">Under review</dd></div>
              <div className="col-span-2"><dt className="text-xs text-[#707a8c]">Release date</dt><dd className="mt-1 text-[#e9edf4]">{releaseDate}</dd></div>
              {release.primaryGenre || release.genre ? <div><dt className="text-xs text-[#707a8c]">Genre</dt><dd className="mt-1 truncate text-[#e9edf4]">{release.primaryGenre || release.genre}</dd></div> : null}
              {release.language ? <div><dt className="text-xs text-[#707a8c]">Language</dt><dd className="mt-1 truncate text-[#e9edf4]">{release.language}</dd></div> : null}
            </dl>
          </aside>
        </div>

        <div className="border-t border-white/[0.06] pt-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#59dfe0]">Help after submission</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-[#f5f7fb] sm:text-3xl">Frequently asked questions</h2>
            <p className="mt-2 text-sm text-[#98a1b3]">Everything you need to know after submitting your release.</p>
          </div>
          <div className="mt-5 grid gap-2 lg:grid-cols-2 lg:items-start">
            {faqs.map((faq, index) => {
              const open = openFaq === index;
              return (
                <div key={faq.question} className={clsx("hymn-success-faq", open && "hymn-success-faq-open")}>
                  <button type="button" onClick={() => setOpenFaq(open ? -1 : index)} className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left">
                    <span className="text-sm font-semibold text-[#f5f7fb]">{faq.question}</span>
                    <ChevronDown className="h-5 w-5 shrink-0 text-[#59dfe0] transition duration-300" />
                  </button>
                  <div className="hymn-success-faq-answer px-4">
                    <p className="pb-4 text-sm leading-6 text-[#98a1b3]">{faq.answer}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="mt-6 border-t border-white/[0.06] pt-5 text-sm text-[#98a1b3]">
          Need help? Visit the <Link href="/faq" className="hymn-success-help-link">help center</Link> or contact the HYMN team.
        </p>
      </div>
    </section>
  );
}

export function QueueCard({ reviewing, projectedPosition, eta, percent }: { reviewing: number; projectedPosition: number; eta: string; percent: number }) {
  return (
    <div className="rounded-[1.5rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Live queue system</p>
          <h2 className="mt-3 text-2xl font-semibold" style={{ color: "var(--text)" }}>Transparent release review tracking</h2>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em]" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}><Disc3 className="h-3.5 w-3.5" />Queue moving</span>
      </div>
      <div className="mt-5 grid gap-3 text-sm" style={{ color: "var(--text-muted)" }}>
        <p>Currently reviewing: <strong style={{ color: "var(--text)" }}>{reviewing}</strong> releases</p>
        <p>Your projected position: <strong style={{ color: "var(--text)" }}>#{projectedPosition}</strong></p>
        <p>Estimated review: <strong style={{ color: "var(--text)" }}>{eta}</strong></p>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}><div className="shimmer-track h-full rounded-full" style={{ width: `${percent}%` }} /></div>
      <p className="mt-3 text-sm" style={{ color: "var(--text-soft)" }}>{percent}% of the active review batch has already moved forward.</p>
    </div>
  );
}

export function ArtworkWarning({ warning }: { warning: string }) {
  return <div className="mt-4 flex items-start gap-3 rounded-[1.3rem] border px-4 py-4 text-sm" style={{ borderColor: "var(--border-strong)", background: "var(--accent-soft)", color: "var(--text)" }}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{warning}</div>;
}



// vercel trigger

// vercel trigger
