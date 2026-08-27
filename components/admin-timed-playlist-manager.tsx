"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, CircleAlert, Clock3, Loader2, Plus, RefreshCw, Search, Sparkles, Trash2, X } from "lucide-react";
import type { SpotifyAdminConnectionStatus, SpotifyTrackSearchResult, TimedPlaylistDashboard, TimedPlaylistModuleView, TimedPlaylistTrack } from "@/lib/types";

type ApiState = {
  dashboard: TimedPlaylistDashboard;
  spotifyConnection: SpotifyAdminConnectionStatus | null;
  warning?: string | null;
  message?: string;
};

type AlertState = {
  type: "success" | "error";
  text: string;
} | null;

type FormState = {
  spotifyUrl: string;
  playlistName: string;
  playlistUrl: string;
  startAt: string;
  endAt: string;
};

type TrackCreatePayload = {
  spotifyUrl: string;
  playlistName: string;
  playlistUrl: string;
  startAt: string;
  endAt: string;
};

type TrackMutationPayload = {
  id: number;
  action: "extend" | "remove";
  endAt?: string;
};

type TrackRequestPayload = TrackCreatePayload | TrackMutationPayload;

const MODULE_NAV: Array<{ key: TimedPlaylistModuleView; label: string; description: string }> = [
  { key: "dashboard", label: "Dashboard", description: "Live overview and health" },
  { key: "add-track", label: "Add Track", description: "Add a timed Spotify track" },
  { key: "active-tracks", label: "Active Tracks", description: "Running tracks and countdowns" },
  { key: "expired-tracks", label: "Expired Tracks", description: "Tracks removed from rotation" }
];

const PLAYLIST_OPTIONS = [
  {
    name: "Dusk Till Dawn",
    url: "https://open.spotify.com/playlist/2soKoURWSXnWJ48ygivet8?si=be915af9a28a4c9f"
  },
  {
    name: "Fresh Releases",
    url: "https://open.spotify.com/playlist/1Gx9l9GVerLbzL3Wc7HPBK?si=178eef56e7c348c1"
  },
  {
    name: "Indie Hits",
    url: "https://open.spotify.com/playlist/5XZL9kya8MYerEUJsvzyyR?si=fecde6c475d4420b"
  },
  {
    name: "Ungatekept Gems",
    url: "https://open.spotify.com/playlist/6SMKwPUHU0T7HKiaz4Qcvv?si=87c364ebcade434d"
  }
];
const SPOTIFY_TRACK_PATTERN = /^https?:\/\/(?:open\.)?spotify\.com\/track\/[A-Za-z0-9]+(?:[/?#].*)?$/i;
const SPOTIFY_TRACK_URI_PATTERN = /^spotify:track:[A-Za-z0-9]+$/i;

function toDatetimeLocalValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIsoFromDatetimeLocal(value: string) {
  return new Date(value).toISOString();
}

function isSpotifyTrackUrl(value: string) {
  const trimmed = value.trim();
  return SPOTIFY_TRACK_PATTERN.test(trimmed) || SPOTIFY_TRACK_URI_PATTERN.test(trimmed);
}

function isSpotifyInputLike(value: string) {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) || /^spotify:/i.test(trimmed);
}

function formatLocalDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatCountdown(targetIso: string, nowMs: number) {
  const diff = new Date(targetIso).getTime() - nowMs;
  if (diff <= 0) return "Expired";

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  return `${seconds}s`;
}

function isExpired(track: TimedPlaylistTrack, nowMs: number) {
  return track.status === "expired" || new Date(track.endAt).getTime() <= nowMs;
}

function addMinutesToDatetimeLocal(value: string, minutes: number) {
  return toDatetimeLocalValue(new Date(new Date(value).getTime() + minutes * 60000));
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-[1.25rem] border border-border bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-white/45">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      {detail ? <p className="mt-2 text-sm text-white/55">{detail}</p> : null}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]"
      style={{
        borderColor: active ? "rgba(118, 3, 3, 0.65)" : "rgba(255, 255, 255, 0.12)",
        background: active ? "rgba(118, 3, 3, 0.16)" : "rgba(255, 255, 255, 0.04)",
        color: active ? "#fff" : "rgba(255, 255, 255, 0.68)"
      }}
    >
      {active ? "Active" : "Expired"}
    </span>
  );
}

function SkeletonRow() {
  return <div className="h-28 animate-pulse rounded-[1.25rem] border border-border bg-white/[0.04]" />;
}

function TrackRow({
  track,
  nowMs,
  onRemove,
  onExtend,
  isExtending,
  extendValue,
  onExtendValueChange,
  onConfirmExtend,
  onCancelExtend,
  canRemove
}: {
  track: TimedPlaylistTrack;
  nowMs: number;
  onRemove: (trackId: number) => void;
  onExtend: (track: TimedPlaylistTrack) => void;
  isExtending: boolean;
  extendValue: string;
  onExtendValueChange: (value: string) => void;
  onConfirmExtend: () => void;
  onCancelExtend: () => void;
  canRemove: boolean;
}) {
  const expired = isExpired(track, nowMs);
  return (
    <article className="rounded-[1.25rem] border border-border bg-white/[0.03] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-white">{track.trackName}</p>
              <p className="mt-1 truncate text-sm text-white/60">{track.artistName}</p>
            </div>
            <StatusBadge active={!expired} />
          </div>
          <div className="mt-4 grid gap-2 text-sm text-white/65 sm:grid-cols-3">
            <p><span className="text-white/40">Playlist:</span> {track.playlistName}</p>
            <p><span className="text-white/40">Start:</span> {formatLocalDateTime(track.startAt)}</p>
            <p><span className="text-white/40">End:</span> {formatLocalDateTime(track.endAt)}</p>
          </div>
        </div>

        <div className="grid gap-3 rounded-[1.1rem] border border-border bg-black/20 p-4 text-sm text-white/70 lg:min-w-[180px]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/40">Countdown</p>
            <p className="mt-2 text-2xl font-semibold text-white">{expired ? "00:00:00" : formatCountdown(track.endAt, nowMs)}</p>
          </div>
          <p className="flex items-center gap-2 text-white/55"><Clock3 className="h-4 w-4" /> Live timer</p>
        </div>
      </div>

      {!expired ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => onExtend(track)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
            <RefreshCw className="h-4 w-4" /> Extend time
          </button>
          <button type="button" onClick={() => onRemove(track.id)} disabled={!canRemove} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#760303]/70 bg-[#760303] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            <Trash2 className="h-4 w-4" /> Remove
          </button>
        </div>
      ) : null}

      {isExtending ? (
        <div className="mt-4 grid gap-3 rounded-[1.1rem] border border-border bg-black/30 p-4 sm:grid-cols-[1fr,auto] sm:items-end">
          <label className="grid gap-2 text-sm text-white/70">
            New end time
            <input
              type="datetime-local"
              value={extendValue}
              onChange={(event) => onExtendValueChange(event.target.value)}
              className="w-full rounded-2xl border border-border bg-black/40 px-4 py-3 text-white outline-none"
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => onExtendValueChange(addMinutesToDatetimeLocal(extendValue, 15))} className="rounded-full border border-border bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08]">
              +15m
            </button>
            <button type="button" onClick={() => onExtendValueChange(addMinutesToDatetimeLocal(extendValue, 60))} className="rounded-full border border-border bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08]">
              +60m
            </button>
            <button type="button" onClick={onConfirmExtend} className="rounded-full bg-[#760303] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110">
              Save
            </button>
            <button type="button" onClick={onCancelExtend} className="rounded-full border border-border bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/[0.08]">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function AdminTimedPlaylistManager() {
  const [activeView, setActiveView] = useState<TimedPlaylistModuleView>("dashboard");
  const [dashboard, setDashboard] = useState<TimedPlaylistDashboard | null>(null);
  const [alert, setAlert] = useState<AlertState>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSpotifyProcessing, setIsSpotifyProcessing] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);
  const [extendValue, setExtendValue] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [spotifyConnection, setSpotifyConnection] = useState<SpotifyAdminConnectionStatus | null>(null);
  const [trackSearchResults, setTrackSearchResults] = useState<SpotifyTrackSearchResult[]>([]);
  const [isTrackSearching, setIsTrackSearching] = useState(false);
  const [trackSearchMessage, setTrackSearchMessage] = useState<string | null>(null);
  const spotifyConnected = Boolean(spotifyConnection?.connected);
  const [form, setForm] = useState<FormState>(() => ({
    spotifyUrl: "",
    playlistName: PLAYLIST_OPTIONS[0].name,
    playlistUrl: PLAYLIST_OPTIONS[0].url,
    startAt: toDatetimeLocalValue(new Date()),
    endAt: toDatetimeLocalValue(new Date(Date.now() + 4 * 60 * 60 * 1000))
  }));

  async function refreshDashboard(showSpinner = true) {
    if (showSpinner) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const response = await fetch("/api/admin/timed-playlists", { cache: "no-store" });
      const data = (await response.json()) as ApiState & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Could not load timed playlists.");
      }
      setDashboard(data.dashboard);
      setSpotifyConnection(data.spotifyConnection ?? null);
      if (data.warning) {
        setAlert({ type: "error", text: data.warning });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load timed playlists.";
      setAlert({ type: "error", text: message });
    } finally {
      if (showSpinner) setIsLoading(false);
      else setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void refreshDashboard(true);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshDashboard(false);
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const query = form.spotifyUrl.trim();

    if (!query || isSpotifyTrackUrl(query) || (isSpotifyInputLike(query) && !isSpotifyTrackUrl(query))) {
      setTrackSearchResults([]);
      setIsTrackSearching(false);
      setTrackSearchMessage(null);
      return;
    }

    if (query.length < 2) {
      setTrackSearchResults([]);
      setIsTrackSearching(false);
      setTrackSearchMessage(null);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsTrackSearching(true);
      setTrackSearchMessage(null);

      try {
        const response = await fetch(`/api/admin/spotify/tracks/search?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const data = await response.json() as { tracks?: SpotifyTrackSearchResult[]; error?: string };
        if (!response.ok) {
          throw new Error(data.error || "Could not search Spotify tracks.");
        }

        const tracks = data.tracks ?? [];
        setTrackSearchResults(tracks);
        setTrackSearchMessage(tracks.length ? null : `No tracks found for "${query}".`);
      } catch (error) {
        if (controller.signal.aborted) return;
        setTrackSearchResults([]);
        setTrackSearchMessage(error instanceof Error ? error.message : "Could not search Spotify tracks.");
      } finally {
        if (!controller.signal.aborted) {
          setIsTrackSearching(false);
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [form.spotifyUrl]);

  const liveActiveTracks = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.activeTracks.filter((track) => !isExpired(track, nowMs));
  }, [dashboard, nowMs]);

  const locallyExpiredActiveTracks = useMemo(() => {
    if (!dashboard) return [];
    const stamp = new Date(nowMs).toISOString();
    return dashboard.activeTracks
      .filter((track) => isExpired(track, nowMs))
      .map((track) => ({ ...track, status: "expired" as const, expiredAt: track.expiredAt ?? stamp, removedAt: track.removedAt ?? stamp }));
  }, [dashboard, nowMs]);

  const liveExpiredTracks = useMemo(() => {
    if (!dashboard) return [];
    return [...dashboard.expiredTracks, ...locallyExpiredActiveTracks].sort((left, right) => new Date(right.expiredAt ?? right.removedAt ?? right.updatedAt).getTime() - new Date(left.expiredAt ?? left.removedAt ?? left.updatedAt).getTime());
  }, [dashboard, locallyExpiredActiveTracks]);

  const playlistOptions = PLAYLIST_OPTIONS;
  const summary = useMemo(() => {
    if (!dashboard) return null;
    const nextExpiryAt = liveActiveTracks.reduce<string | null>((closest, track) => {
      if (!closest) return track.endAt;
      return new Date(track.endAt).getTime() < new Date(closest).getTime() ? track.endAt : closest;
    }, null);

    return {
      ...dashboard.summary,
      activeCount: liveActiveTracks.length,
      expiredCount: liveExpiredTracks.length,
      nextExpiryAt
    };
  }, [dashboard, liveActiveTracks, liveExpiredTracks]);

  const spotifyUrlValue = form.spotifyUrl.trim();
  const spotifyUrlError = spotifyUrlValue && isSpotifyInputLike(spotifyUrlValue) && !isSpotifyTrackUrl(spotifyUrlValue) ? "Paste a Spotify track link or type a song name." : "";
  const timeRangeError = form.startAt && form.endAt && new Date(form.endAt).getTime() <= new Date(form.startAt).getTime() ? "End time must be after the start time." : "";

  async function submitTrack(payload: TrackRequestPayload, successMessage: string): Promise<boolean> {
    setIsSaving(true);
    setAlert(null);
    try {
      const response = await fetch("/api/admin/timed-playlists", {
        method: "action" in payload ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json()) as ApiState & { error?: string; track?: TimedPlaylistTrack };
      if (!response.ok) {
        throw new Error(data.error || "Could not update timed playlists.");
      }
      setDashboard(data.dashboard);
      setSpotifyConnection(data.spotifyConnection ?? null);
      if (data.warning) {
        setAlert({ type: "error", text: data.warning });
      }
      setAlert({ type: "success", text: data.message || successMessage });
      setActiveView("action" in payload && payload.action === "remove" ? "expired-tracks" : "active-tracks");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update timed playlists.";
      setAlert({ type: "error", text: message });
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!spotifyConnected) {
      setAlert({ type: "error", text: "Connect Spotify before adding tracks." });
      return;
    }
    const trimmedUrl = form.spotifyUrl.trim();
    if (!trimmedUrl) {
      setAlert({ type: "error", text: "Enter a song name or Spotify track link." });
      return;
    }
    if (isSpotifyInputLike(trimmedUrl) && !isSpotifyTrackUrl(trimmedUrl)) {
      setAlert({ type: "error", text: "Paste a Spotify track link or type a song name." });
      return;
    }
    if (new Date(form.endAt).getTime() <= new Date(form.startAt).getTime()) {
      setAlert({ type: "error", text: "End time must be after the start time." });
      return;
    }

    const success = await submitTrack(
      {
        spotifyUrl: trimmedUrl,
        playlistName: form.playlistName,
        playlistUrl: form.playlistUrl,
        startAt: toIsoFromDatetimeLocal(form.startAt),
        endAt: toIsoFromDatetimeLocal(form.endAt)
      },
      "Track added successfully."
    );

    if (success) {
      setForm((current) => ({
        ...current,
        spotifyUrl: "",
        startAt: toDatetimeLocalValue(new Date()),
        endAt: toDatetimeLocalValue(new Date(Date.now() + 4 * 60 * 60 * 1000))
      }));
    }
  }

  function handleSelectTrack(track: SpotifyTrackSearchResult) {
    setForm((current) => ({ ...current, spotifyUrl: track.spotifyUrl }));
    setTrackSearchResults([]);
    setTrackSearchMessage(null);
  }

  function handleRemove(trackId: number) {
    if (!spotifyConnected) {
      setAlert({ type: "error", text: "Connect Spotify before removing tracks." });
      return;
    }
    void submitTrack({ id: trackId, action: "remove" }, "Track removed.");
  }

  function beginExtend(track: TimedPlaylistTrack) {
    setEditingTrackId(track.id);
    setExtendValue(toDatetimeLocalValue(new Date(track.endAt)));
    setAlert(null);
  }

  function cancelExtend() {
    setEditingTrackId(null);
    setExtendValue("");
  }

  async function confirmExtend(trackId: number) {
    if (!extendValue) {
      setAlert({ type: "error", text: "Choose a new end time." });
      return;
    }
    const success = await submitTrack({ id: trackId, action: "extend", endAt: toIsoFromDatetimeLocal(extendValue) }, "Track time extended.");
    if (success) {
      cancelExtend();
    }
  }

  async function handleDisconnectSpotify() {
    setIsSpotifyProcessing(true);
    setAlert(null);
    try {
      const response = await fetch("/api/admin/spotify/disconnect", { method: "POST" });
      const data = await response.json() as { error?: string; message?: string; status?: SpotifyAdminConnectionStatus };
      if (!response.ok) {
        throw new Error(data.error || "Could not disconnect Spotify.");
      }
      setSpotifyConnection(data.status ?? null);
      setAlert({ type: "success", text: data.message || "Spotify has been disconnected." });
      await refreshDashboard(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not disconnect Spotify.";
      setAlert({ type: "error", text: message });
    } finally {
      setIsSpotifyProcessing(false);
    }
  }

  const navLabel = MODULE_NAV.find((item) => item.key === activeView)?.label ?? "Dashboard";
  const navDescription = MODULE_NAV.find((item) => item.key === activeView)?.description ?? "Live overview and control";

  return (
    <section className="rounded-[2rem] border border-border bg-[#0f0f0f] p-4 text-white shadow-[0_24px_64px_rgba(0,0,0,0.35)] sm:p-6">
      <div className="mb-6 flex flex-col gap-3 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="inline-flex items-center rounded-full border border-border bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">Timed Playlist Manager</span>
          <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">Admin control for timed Spotify playlists.</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
            Add a track, assign a playlist, set the start and end time, and let the module expire it automatically without any manual cleanup.
          </p>
        </div>
        <div className="rounded-[1.25rem] border border-border bg-white/[0.03] px-4 py-3 text-sm text-white/60">
          <div className="flex items-center gap-2 text-white">
            <Sparkles className="h-4 w-4 text-[#760303]" />
            {navLabel}
          </div>
          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-white/40">{navDescription}</p>
        </div>
      </div>

      <div className="mb-6 rounded-[1.25rem] border border-border bg-white/[0.03] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">{spotifyConnected ? `Spotify connected as ${spotifyConnection?.displayName ?? "Spotify user"}` : "Spotify not connected"}</p>
            <p className="mt-1 text-sm text-white/55">
              {spotifyConnected ? "Playlist writes and removals are live." : "Connect Spotify once to authorize track writes from this panel."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {spotifyConnected ? (
              <button type="button" onClick={() => void handleDisconnectSpotify()} disabled={isSpotifyProcessing} className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-70">
                {isSpotifyProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span className="ml-2">Disconnect Spotify</span>
              </button>
            ) : (
              <button type="button" onClick={() => {
                const returnTo = `${window.location.pathname}${window.location.search}`;
                window.location.assign(`/api/admin/spotify/connect?returnTo=${encodeURIComponent(returnTo)}`);
              }} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#760303] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110">
                Connect Spotify
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="lg:hidden">
        <label className="grid gap-2 text-sm text-white/70">
          Module view
          <select
            value={activeView}
            onChange={(event) => setActiveView(event.target.value as TimedPlaylistModuleView)}
            className="rounded-[1.25rem] border px-4 py-3 text-white outline-none"
            style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)" }}
          >
            {MODULE_NAV.map((item) => (
              <option key={item.key} value={item.key} className="bg-[#0f0f0f] text-white">
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px,minmax(0,1fr)]">
        <aside className="hidden gap-2 lg:grid">
          {MODULE_NAV.map((item) => {
            const active = item.key === activeView;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveView(item.key)}
                className="rounded-[1.25rem] border px-4 py-4 text-left transition"
                style={{
                  borderColor: active ? "rgba(118, 3, 3, 0.7)" : "rgba(255, 255, 255, 0.08)",
                  background: active ? "rgba(118, 3, 3, 0.16)" : "rgba(255, 255, 255, 0.03)"
                }}
              >
                <p className="text-sm font-semibold text-white">{item.label}</p>
                <p className="mt-1 text-xs leading-5 text-white/55">{item.description}</p>
              </button>
            );
          })}
        </aside>

        <main className="rounded-[1.5rem] border border-border bg-[#151515] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-2xl font-semibold text-white">{navLabel}</h3>
              <p className="mt-1 text-sm text-white/55">{navDescription}</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-white/45">
              {isRefreshing ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Auto-syncing</span> : null}
              <button type="button" onClick={() => void refreshDashboard(true)} className="inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
          </div>

          {alert ? (
            <div className="mt-5 flex items-start gap-3 rounded-[1.25rem] border px-4 py-3 text-sm" style={{ borderColor: alert.type === "success" ? "rgba(118, 3, 3, 0.65)" : "rgba(255, 255, 255, 0.12)", background: alert.type === "success" ? "rgba(118, 3, 3, 0.16)" : "rgba(255, 255, 255, 0.04)" }}>
              {alert.type === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-white" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-white/85" />}
              <p className={alert.type === "success" ? "text-white" : "text-white/75"}>{alert.text}</p>
            </div>
          ) : null}

          {summary ? (
            <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Active tracks" value={summary.activeCount} detail="Currently in rotation" />
              <Metric label="Expired tracks" value={summary.expiredCount} detail="Removed from live rotation" />
              <Metric label="Playlists" value={summary.playlistCount} detail="Available playlist groups" />
              <Metric label="Next expiry" value={summary.nextExpiryAt ? formatLocalDateTime(summary.nextExpiryAt) : "None"} detail={summary.nextExpiryAt ? formatCountdown(summary.nextExpiryAt, nowMs) : "No active countdowns"} />
            </section>
          ) : null}

          <div className="mt-6">
            {isLoading && !dashboard ? (
              <div className="grid gap-4">
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            ) : (
              <>
                {activeView === "dashboard" ? (
                  <div className="grid gap-4">
                    <div className="rounded-[1.25rem] border border-border bg-white/[0.03] p-5">
                      <p className="text-sm uppercase tracking-[0.22em] text-white/45">What this module does</p>
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
                        Add a Spotify track once, attach a playlist, and the module will keep it live until the end time passes. Expired tracks automatically move to the archive section so the active list stays clean.
                      </p>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="rounded-[1.25rem] border border-border bg-white/[0.03] p-5">
                        <p className="text-sm font-semibold text-white">Live tracks</p>
                        <div className="mt-4 grid gap-3">
                          {liveActiveTracks.slice(0, 3).map((track) => (
                            <div key={track.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-black/20 px-4 py-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-white">{track.trackName}</p>
                                <p className="truncate text-xs text-white/55">{track.artistName}</p>
                              </div>
                              <p className="text-sm font-semibold text-white">{formatCountdown(track.endAt, nowMs)}</p>
                            </div>
                          ))}
                          {!liveActiveTracks.length ? <p className="text-sm text-white/55">No active tracks right now.</p> : null}
                        </div>
                      </div>
                      <div className="rounded-[1.25rem] border border-border bg-white/[0.03] p-5">
                        <p className="text-sm font-semibold text-white">Automatic expiry</p>
                        <p className="mt-3 text-sm leading-6 text-white/60">
                          The backend sweeps expired tracks on every refresh and every mutation, so you never need to manually clean the active list.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {activeView === "add-track" ? (
                  <form onSubmit={(event) => void handleAddTrack(event)} className="grid gap-4">
                    <div className="grid gap-4 xl:grid-cols-2">
                      <label className="grid gap-2 text-sm text-white/70 xl:col-span-2">
                        Song name or Spotify link
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                          <input
                            type="text"
                            value={form.spotifyUrl}
                            onChange={(event) => setForm((current) => ({ ...current, spotifyUrl: event.target.value }))}
                            placeholder="Paste a Spotify track link or type a song name"
                            className="w-full rounded-2xl border px-4 py-3 pl-11 pr-10 text-white outline-none"
                            style={{ borderColor: spotifyUrlError ? "rgba(118, 3, 3, 0.8)" : "rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)" }}
                          />
                          {form.spotifyUrl.trim() ? (
                            <button
                              type="button"
                              onClick={() => setForm((current) => ({ ...current, spotifyUrl: "" }))}
                              className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white/[0.04] text-white/55 transition hover:bg-white/[0.08] hover:text-white"
                              aria-label="Clear song input"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          ) : null}
                          {trackSearchResults.length ? (
                            <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-[1.5rem] border border-border bg-[#111111] shadow-[0_24px_64px_rgba(0,0,0,0.45)]">
                              <div className="border-b border-border px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/40">
                                Spotify results
                              </div>
                              <div className="max-h-72 overflow-auto">
                                {trackSearchResults.map((track) => (
                                  <button
                                    key={track.id}
                                    type="button"
                                    onClick={() => handleSelectTrack(track)}
                                    className="flex w-full items-center gap-3 border-b border-white/8 px-4 py-3 text-left transition last:border-b-0 hover:bg-white/[0.04]"
                                  >
                                    {track.imageUrl ? (
                                      <img
                                        src={track.imageUrl}
                                        alt=""
                                        className="h-12 w-12 rounded-2xl object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-white/[0.04] text-white/45">
                                        <Search className="h-4 w-4" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-semibold text-white">{track.name}</p>
                                      <p className="truncate text-xs text-white/55">{track.artistName}</p>
                                      {track.albumName ? <p className="truncate text-xs text-white/35">{track.albumName}</p> : null}
                                    </div>
                                    <span className="rounded-full border border-[#760303]/70 bg-[#760303] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
                                      Use
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        {spotifyUrlError ? (
                          <span className="text-xs text-[#ffb5b5]">{spotifyUrlError}</span>
                        ) : isTrackSearching ? (
                          <span className="inline-flex items-center gap-2 text-xs text-white/45">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching Spotify...
                          </span>
                        ) : trackSearchMessage ? (
                          <span className="text-xs text-white/40">{trackSearchMessage}</span>
                        ) : (
                          <span className="text-xs text-white/40">Type a song name to search Spotify, or paste a track link and submit.</span>
                        )}
                      </label>

                      <label className="grid gap-2 text-sm text-white/70">
                        Playlist
                        <select
                          value={form.playlistName}
                          onChange={(event) => {
                            const selected = PLAYLIST_OPTIONS.find((playlist) => playlist.name === event.target.value) ?? PLAYLIST_OPTIONS[0];
                            setForm((current) => ({ ...current, playlistName: selected.name, playlistUrl: selected.url }));
                          }}
                          className="rounded-2xl border px-4 py-3 text-white outline-none"
                          style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)" }}
                        >
                          {playlistOptions.map((playlist) => (
                            <option key={playlist.name} value={playlist.name} className="bg-[#0f0f0f] text-white">
                              {playlist.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2 text-sm text-white/70">
                        Start time
                        <input
                          type="datetime-local"
                          value={form.startAt}
                          onChange={(event) => setForm((current) => ({ ...current, startAt: event.target.value }))}
                          className="rounded-2xl border px-4 py-3 text-white outline-none"
                          style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)" }}
                        />
                      </label>

                      <label className="grid gap-2 text-sm text-white/70">
                        End time
                        <input
                          type="datetime-local"
                          value={form.endAt}
                          onChange={(event) => setForm((current) => ({ ...current, endAt: event.target.value }))}
                          className="rounded-2xl border px-4 py-3 text-white outline-none"
                          style={{ borderColor: timeRangeError ? "rgba(118, 3, 3, 0.8)" : "rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)" }}
                        />
                        {timeRangeError ? <span className="text-xs text-[#ffb5b5]">{timeRangeError}</span> : null}
                      </label>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-white/45">{spotifyConnected ? "Need speed? Add a track in one pass, then let the timer handle the rest." : "Connect Spotify first so the admin panel can write to the playlist."}</p>
                      <button
                        type="submit"
                        disabled={isSaving || !spotifyConnected}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#760303] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {spotifyConnected ? "Add Track" : "Connect Spotify to Add"}
                      </button>
                    </div>
                  </form>
                ) : null}

                {activeView === "active-tracks" ? (
                  <div className="grid gap-4">
                    {liveActiveTracks.length ? liveActiveTracks.map((track) => (
                      <TrackRow
                        key={track.id}
                        track={track}
                        nowMs={nowMs}
                        onRemove={handleRemove}
                        onExtend={beginExtend}
                        isExtending={editingTrackId === track.id}
                        extendValue={extendValue}
                        onExtendValueChange={setExtendValue}
                        onConfirmExtend={() => confirmExtend(track.id)}
                        onCancelExtend={cancelExtend}
                        canRemove={spotifyConnected}
                      />
                    )) : <div className="rounded-[1.25rem] border border-border bg-white/[0.03] p-6 text-sm text-white/55">No active tracks. Add one from the form to start a timed playlist.</div>}
                  </div>
                ) : null}

                {activeView === "expired-tracks" ? (
                  <div className="grid gap-4">
                    {liveExpiredTracks.length ? liveExpiredTracks.map((track) => (
                      <article key={track.id} className="rounded-[1.25rem] border border-border bg-white/[0.03] p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-lg font-semibold text-white">{track.trackName}</p>
                            <p className="mt-1 text-sm text-white/60">{track.artistName}</p>
                          </div>
                          <StatusBadge active={false} />
                        </div>
                        <div className="mt-4 grid gap-2 text-sm text-white/60 sm:grid-cols-2">
                          <p><span className="text-white/40">Playlist:</span> {track.playlistName}</p>
                          <p><span className="text-white/40">Expired at:</span> {formatLocalDateTime(track.expiredAt ?? track.removedAt ?? track.updatedAt)}</p>
                        </div>
                      </article>
                    )) : <div className="rounded-[1.25rem] border border-border bg-white/[0.03] p-6 text-sm text-white/55">Expired tracks will appear here after their end time passes.</div>}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </main>
      </div>
    </section>
  );
}




