"use client";

import clsx from "clsx";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, ChevronDown, Clock3, Disc3, DollarSign, Globe2, Music2, Play, Sparkles, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { contributorRoles, countryOptions, legalGroups } from "@/lib/release-config";
import type { Release } from "@/lib/types";

export type ContributorDraft = { id: string; legalName: string; artistName: string };

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

  return (
    <ModalShell open={state.open} onClose={onClose} maxWidthClass="max-w-3xl">
      <div className="flex max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-[1.8rem] border shadow-2xl" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
        <div className="flex items-center justify-between gap-3 border-b px-6 py-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <div>
            <h3 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Contributor splits</h3>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Enter the legal names that should flow into royalty and rights matching.</p>
          </div>
          <button type="button" className="btn-outline pressable" onClick={onClose}>Close</button>
        </div>
        <div className="grid flex-1 gap-5 overflow-y-auto overscroll-contain px-6 py-5 pr-5">
          {contributorRoles.map((role) => {
            const key = `${role.key}s` as "songwriters" | "composers" | "producers";
            return (
              <div key={role.key} className="rounded-[1.3rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-lg font-semibold" style={{ color: "var(--text)" }}>{role.label}</h4>
                  <button type="button" className="btn-outline pressable" onClick={() => addRoleEntry(key)}>Add {role.label}</button>
                </div>
                <div className="mt-4 grid gap-3">
                  {local[key].map((entry) => (
                    <div key={entry.id} className="grid gap-3 md:grid-cols-[1fr,1fr,auto]">
                      <input className="field" placeholder="Legal name" value={entry.legalName} onChange={(event) => updateRole(key, entry.id, { legalName: event.target.value })} />
                      <input className="field" placeholder="Artist name (optional)" value={entry.artistName} onChange={(event) => updateRole(key, entry.id, { artistName: event.target.value })} />
                      <button type="button" className="btn-outline pressable" onClick={() => removeRoleEntry(key, entry.id)}>Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {!valid ? <p className="px-6 pb-0 text-sm text-red-400">Each contributor role needs at least one legal name.</p> : null}
        <div className="flex justify-end gap-3 border-t px-6 py-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <button type="button" className="btn-outline pressable" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary pressable" disabled={!valid} onClick={() => onSave(local)}>Save contributors</button>
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

export function SuccessState({ release, onReset, title = "Your release has been submitted!", resetLabel = "Submit another release" }: { release: Release; onReset: () => void; title?: string; resetLabel?: string }) {
  const [openFaq, setOpenFaq] = useState(0);
  const releaseTitle = release.releaseTitle || release.trackName || "GULLAK SAMBHAL";
  const artistName = release.artistName || "HYMN Artist";
  const artworkUrl = release.artworkUrl || "/uploads/site/home-hero/380d946e-e499-4860-a0cd-2f19ba1b258b.png";
  const checklist = [
    { label: "Build your release", state: "done" },
    { label: "Submit for review", state: "done" },
    { label: "HYMN specialists reviewing", state: "active" },
    { label: "Processed by stores", state: "future" },
    { label: "Live on platforms", state: "future" }
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
    <section className="hymn-success-page relative isolate overflow-hidden rounded-[2.5rem] border px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
      <div className="hymn-success-orb hymn-success-orb-a" />
      <div className="hymn-success-orb hymn-success-orb-b" />
      <div className="relative z-10">
        <div className="mb-14 flex items-center justify-between gap-4">
          <Link href="/" className="group inline-flex items-center" aria-label="HYMN home">
            <img src="/assets/hymnlogowhite.png" alt="HYMN" className="h-8 w-auto object-contain transition duration-300 group-hover:drop-shadow-[0_0_18px_rgba(89,223,224,0.55)] sm:h-10" />
          </Link>
          <span className="rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-[#98a1b3]">Submission secured</span>
        </div>

        <div className="grid items-center gap-12 xl:grid-cols-[1.02fr,0.98fr] xl:gap-16">
          <div className="hymn-success-enter">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#59dfe0]">Release cycle initiated</p>
            <h1 className="mt-5 max-w-4xl text-5xl font-bold leading-[0.94] tracking-[-0.03em] text-[#f5f7fb] sm:text-6xl lg:text-7xl">
              {title}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[#98a1b3] sm:text-lg">
              Your music is now entering the review and distribution process. Keep an eye on your emails; HYMN will notify you about every important update related to <span className="text-[#f5f7fb]">{releaseTitle}</span>.
            </p>

            <div className="mt-9 max-w-2xl rounded-[1.6rem] border border-white/[0.06] bg-[#10141b]/72 p-4 shadow-[0_28px_80px_rgba(0,0,0,0.28)] sm:p-5">
              <div className="space-y-4">
                {checklist.map((item) => (
                  <div key={item.label} className={clsx("hymn-success-step", item.state === "active" && "hymn-success-step-active", item.state === "future" && "hymn-success-step-future")}>
                    <span className="hymn-success-step-icon">
                      {item.state === "done" ? <Check className="h-4 w-4" /> : item.state === "active" ? <Clock3 className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                    </span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/services" className="hymn-success-primary-cta inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold">
                Promote my music
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/dashboard/releases" className="hymn-success-secondary-cta inline-flex min-h-12 items-center justify-center rounded-full px-6 py-3 text-sm font-semibold">
                Go to my releases
              </Link>
              <button type="button" onClick={onReset} className="hymn-success-tertiary-cta inline-flex min-h-12 items-center justify-center rounded-full px-5 py-3 text-sm font-semibold">
                {resetLabel}
              </button>
            </div>
          </div>

          <div className="relative min-h-[540px] hymn-success-enter-delayed">
            <Sparkles className="hymn-success-float-icon left-[9%] top-[8%] h-5 w-5 text-[#59dfe0]" />
            <Star className="hymn-success-float-icon right-[13%] top-[5%] h-4 w-4 text-[#f5f7fb]/70" />
            <DollarSign className="hymn-success-float-icon bottom-[18%] left-[3%] h-5 w-5 text-[#59dfe0]/70" />
            <Globe2 className="hymn-success-float-icon bottom-[9%] right-[10%] h-6 w-6 text-[#f5f7fb]/60" />
            <Music2 className="hymn-success-float-icon right-[4%] top-[42%] h-5 w-5 text-[#59dfe0]/80" />

            <div className="hymn-release-card mx-auto max-w-[420px]">
              <div className="relative aspect-square overflow-hidden rounded-[1.7rem] border border-white/[0.08]">
                <img src={artworkUrl} alt={`${releaseTitle} artwork`} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#05070b]/78 via-transparent to-white/6" />
                <button type="button" aria-label="Play preview" className="absolute left-5 top-5 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white shadow-[0_12px_36px_rgba(0,0,0,0.35)] backdrop-blur-md">
                  <Play className="h-4 w-4 fill-current" />
                </button>
              </div>
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#59dfe0]">HYMN release preview</p>
                <h2 className="mt-2 truncate text-3xl font-semibold tracking-[-0.02em] text-[#f5f7fb]">{releaseTitle}</h2>
                <p className="mt-1 text-sm text-[#98a1b3]">{artistName}</p>
                <div className="mt-5 space-y-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                    <span className="hymn-success-player-bar block h-full w-[64%] rounded-full" />
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {[42, 64, 38, 76, 54].map((height, index) => (
                      <span key={index} className="rounded-full bg-[#59dfe0]/70" style={{ height: `${height}px` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-20 max-w-4xl">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#59dfe0]">Next questions</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[#f5f7fb] sm:text-4xl">Frequently asked questions</h2>
          </div>
          <div className="mt-8 grid gap-3">
            {faqs.map((faq, index) => {
              const open = openFaq === index;
              return (
                <div key={faq.question} className={clsx("hymn-success-faq", open && "hymn-success-faq-open")}>
                  <button type="button" onClick={() => setOpenFaq(open ? -1 : index)} className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left">
                    <span className="text-base font-semibold text-[#f5f7fb]">{faq.question}</span>
                    <ChevronDown className="h-5 w-5 shrink-0 text-[#59dfe0] transition duration-300" />
                  </button>
                  <div className="hymn-success-faq-answer px-5">
                    <p className="pb-5 text-sm leading-7 text-[#98a1b3]">{faq.answer}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="mt-12 text-center text-sm text-[#98a1b3]">
          Check out our <Link href="/faq" className="hymn-success-help-link">help center</Link> for more information.
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


