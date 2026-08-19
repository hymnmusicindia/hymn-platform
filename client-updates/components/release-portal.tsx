"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Clock3, Filter, Search, Sparkles } from "lucide-react";
import { Release } from "@/lib/types";
import {
  getReleasePortalAction,
  getReleasePortalBadgeStyle,
  getReleasePortalDateLabel,
  getReleasePortalSortKey,
  getReleasePortalStage,
  getReleasePortalStageLabel,
  getReleasePortalTrackCount,
  isReleaseUnfinished
} from "@/lib/release-portal";

const PAGE_SIZE = 12;
const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "released", label: "Released" }
] as const;

type StatusFilter = (typeof STATUS_OPTIONS)[number]["value"];

function normalizeArtist(value: string) {
  return value.trim().toLowerCase();
}

function EmptyState({ title, description, actionHref, actionLabel }: { title: string; description: string; actionHref: string; actionLabel: string }) {
  return (
    <section className="surface-card p-8 sm:p-10 text-center">
      <p className="eyebrow mx-auto">Release portal</p>
      <h2 className="mt-5 text-3xl font-semibold" style={{ color: "var(--text)" }}>{title}</h2>
      <p className="mx-auto mt-4 max-w-2xl text-base" style={{ color: "var(--text-muted)" }}>{description}</p>
      <Link href={actionHref} className="btn-primary pressable mx-auto mt-6 inline-flex">
        {actionLabel}
      </Link>
    </section>
  );
}

function ReleaseCard({ release }: { release: Release }) {
  const stage = getReleasePortalStage(release);
  const action = getReleasePortalAction(release);
  const title = release.releaseTitle?.trim() || release.trackName;
  const trackCount = getReleasePortalTrackCount(release);
  const badgeStyle = getReleasePortalBadgeStyle(stage);

  return (
    <article
      className="group flex h-full w-full flex-col overflow-hidden rounded-[1.35rem] border bg-[color-mix(in_srgb,var(--card)_96%,transparent)] shadow-[var(--shadow-soft)] transition duration-200 md:max-w-[248px] md:justify-self-center md:hover:-translate-y-1 md:hover:scale-[1.02] md:hover:shadow-[var(--shadow-strong)]"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex gap-3 p-3 md:block md:p-0">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--bg-soft)_72%,transparent)] md:h-auto md:w-full md:rounded-none md:aspect-square">
          {release.artworkUrl ? (
            <img
              src={release.artworkUrl}
              alt={title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center" style={{ color: "var(--text-soft)" }}>
              <Sparkles className="h-5 w-5 md:h-8 md:w-8" />
            </div>
          )}
          <div
            className="absolute left-3 top-3 hidden rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] backdrop-blur-md md:inline-flex"
            style={badgeStyle}
          >
            {getReleasePortalStageLabel(stage)}
          </div>
        </div>

        <div className="min-w-0 flex flex-1 flex-col md:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold leading-5 md:text-base md:leading-6" style={{ color: "var(--text)" }}>{title}</h3>
              <p className="mt-1 truncate text-xs md:text-sm" style={{ color: "var(--text-muted)" }}>
                {trackCount} Track{trackCount === 1 ? "" : "s"} / {release.artistName}
              </p>
              <p className="mt-1 text-xs md:mt-2 md:text-sm" style={{ color: "var(--text-soft)" }}>{getReleasePortalDateLabel(release)}</p>
            </div>
            <span
              className="inline-flex shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] md:hidden"
              style={badgeStyle}
            >
              {getReleasePortalStageLabel(stage)}
            </span>
          </div>

          <details className="ios-collapse mt-2 rounded-xl px-3 py-2 md:hidden">
            <summary className="flex list-none items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>
              More details
              <ChevronDown className="ios-collapse-icon h-3.5 w-3.5" />
            </summary>
            <div className="ios-collapse-content">
              <div className="ios-collapse-inner mt-2 grid gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                <p>Stage: {getReleasePortalStageLabel(stage)}</p>
                <p>Artist: {release.artistName}</p>
                <p>Tracks: {trackCount}</p>
              </div>
            </div>
          </details>

          <div className="mt-2 md:hidden">
            <Link
              href={action.href}
              className="flex w-full items-center justify-center rounded-full px-4 py-2.5 text-xs font-semibold transition"
              style={stage === "draft" ? { background: "var(--money)", color: "var(--money-foreground)", boxShadow: "0 14px 34px rgba(245,193,108,0.16)" } : { border: "1px solid var(--border)", color: "var(--text)", background: "var(--bg-soft)" }}
            >
              {action.label}
            </Link>
          </div>

          <div className="mt-4 hidden md:flex">
            <Link
              href={action.href}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold transition"
              style={stage === "draft" ? { background: "var(--money)", color: "var(--money-foreground)", boxShadow: "0 14px 34px rgba(245,193,108,0.16)" } : { border: "1px solid var(--border)", color: "var(--text)", background: "var(--bg-soft)" }}
            >
              {action.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="w-full overflow-hidden rounded-[1.35rem] border bg-[color-mix(in_srgb,var(--card)_96%,transparent)] md:max-w-[260px] md:justify-self-center" style={{ borderColor: "var(--border)" }}>
      <div className="aspect-square animate-pulse bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-24 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
        <div className="h-5 w-4/5 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
        <div className="h-4 w-3/5 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
        <div className="h-11 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
      </div>
    </div>
  );
}

export function ReleasePortal({ releases }: { releases: Release[] }) {
  const sortedReleases = useMemo(
    () => [...releases].sort((left, right) => {
      const leftKey = getReleasePortalSortKey(left);
      const rightKey = getReleasePortalSortKey(right);
      if (leftKey.rank !== rightKey.rank) return rightKey.rank - leftKey.rank;
      return rightKey.timestamp - leftKey.timestamp;
    }),
    [releases]
  );

  const artists = useMemo(
    () => Array.from(new Set(sortedReleases.map((release) => release.artistName).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [sortedReleases]
  );

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [artistFilter, setArtistFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 180);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedSearch, statusFilter, artistFilter]);

  const filteredReleases = useMemo(() => {
    return sortedReleases.filter((release) => {
      const stage = getReleasePortalStage(release);
      const query = debouncedSearch;
      const title = (release.releaseTitle?.trim() || release.trackName).toLowerCase();
      const artist = release.artistName.toLowerCase();
      const matchesSearch = query.length === 0 || title.includes(query) || artist.includes(query);
      const matchesStatus = statusFilter === "all" || stage === statusFilter;
      const matchesArtist = artistFilter === "all" || normalizeArtist(release.artistName) === artistFilter;
      return matchesSearch && matchesStatus && matchesArtist;
    });
  }, [artistFilter, debouncedSearch, sortedReleases, statusFilter]);

  const visibleReleases = filteredReleases.slice(0, visibleCount);
  const draftRelease = sortedReleases.find((release) => isReleaseUnfinished(release));
  const stats = {
    draft: sortedReleases.filter((release) => getReleasePortalStage(release) === "draft").length,
    scheduled: sortedReleases.filter((release) => getReleasePortalStage(release) === "scheduled").length,
    released: sortedReleases.filter((release) => getReleasePortalStage(release) === "released").length
  };
  const statsChips = (
    <>
      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
        <Clock3 className="h-4 w-4" />
        {sortedReleases.length} total releases
      </span>
      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
        Draft {stats.draft}
      </span>
      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
        Scheduled {stats.scheduled}
      </span>
      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
        Released {stats.released}
      </span>
    </>
  );

  const filtersGrid = (
    <>
      <label className="grid gap-2 text-sm">
        <span className="flex items-center gap-2 uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>
          <Filter className="h-3.5 w-3.5" />
          Status
        </span>
        <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm">
        <span className="flex items-center gap-2 uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>
          <Filter className="h-3.5 w-3.5" />
          Artist
        </span>
        <select className="field" value={artistFilter} onChange={(event) => setArtistFilter(event.target.value)}>
          <option value="all">All Artists</option>
          {artists.map((artist) => (
            <option key={artist} value={normalizeArtist(artist)}>{artist}</option>
          ))}
        </select>
      </label>

      <div className="rounded-2xl border px-4 py-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
        <p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>Visible now</p>
        <p className="mt-2 text-lg font-semibold" style={{ color: "var(--text)" }}>{Math.min(visibleCount, filteredReleases.length)} / {filteredReleases.length}</p>
      </div>
    </>
  );

  if (sortedReleases.length === 0) {
    return (
      <div className="grid gap-6">
        <EmptyState
          title="You have no releases yet"
          description="Start your first distribution and keep everything organized from one clean control center."
          actionHref="/distribution/start"
          actionLabel="Create Release"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:gap-8">
      {draftRelease ? (
        <section className="surface-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="eyebrow">Quick action</p>
            <h2 className="mt-3 text-2xl font-semibold" style={{ color: "var(--text)" }}>Continue your draft release</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              Pick up {draftRelease.releaseTitle?.trim() || draftRelease.trackName} from where you left off.
            </p>
          </div>
          <Link href={getReleasePortalAction(draftRelease).href} className="inline-flex w-full items-center justify-center rounded-full px-5 py-3 font-semibold transition hover:-translate-y-0.5 sm:w-auto" style={{ background: "var(--money)", color: "var(--money-foreground)", boxShadow: "0 16px 38px rgba(245,193,108,0.16)" }}>
            Finish your release
          </Link>
        </section>
      ) : null}

      <section className="surface-card p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow">Release management portal</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>Your Releases</h1>
            <p className="mt-3 text-base" style={{ color: "var(--text-muted)" }}>Manage and track all your music releases.</p>
          </div>
          <label className="relative w-full lg:max-w-md">
            <span className="sr-only">Search by title or artist</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-soft)" }} />
            <input
              className="field pl-11"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by title or artist"
            />
          </label>
        </div>

        <details className="ios-collapse mt-5 rounded-2xl p-4 lg:hidden">
          <summary className="flex list-none items-center justify-between gap-3 text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text)" }}>
            Filters and totals
            <ChevronDown className="ios-collapse-icon h-4 w-4" />
          </summary>

          <div className="ios-collapse-content">
            <div className="ios-collapse-inner">
              <div className="mt-4 flex flex-wrap gap-2 text-xs sm:text-sm" style={{ color: "var(--text-muted)" }}>
                {statsChips}
              </div>

              <div className="mt-4 grid gap-3">
                {filtersGrid}
              </div>
            </div>
          </div>
        </details>

        <div className="mt-6 hidden flex-wrap gap-3 text-sm lg:flex" style={{ color: "var(--text-muted)" }}>
          {statsChips}
        </div>

        <div className="mt-6 hidden gap-4 lg:grid lg:grid-cols-[1fr,1fr] xl:grid-cols-[0.7fr,0.7fr,0.6fr]">
          {filtersGrid}
        </div>
      </section>

      <section>
        {filteredReleases.length === 0 ? (
          <EmptyState
            title="No releases match your filters"
            description="Try a different title, artist, or status filter to bring your catalogue back into view."
            actionHref="/dashboard/releases"
            actionLabel="Reset view"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 justify-items-stretch">
            {visibleReleases.map((release) => (
              <ReleaseCard key={release.id} release={release} />
            ))}
          </div>
        )}
      </section>

      {filteredReleases.length > visibleCount ? (
        <section className="flex justify-center">
          <button type="button" onClick={() => setVisibleCount((current) => current + PAGE_SIZE)} className="btn-outline pressable inline-flex w-full sm:w-auto">
            Load More
          </button>
        </section>
      ) : null}
    </div>
  );
}




