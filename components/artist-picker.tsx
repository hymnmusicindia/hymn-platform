"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { ArtistProfile, SpotifyArtistResult } from "@/lib/types";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";

type ArtistPickerProps = {
  label: string;
  helper: string;
  valueIds: ArtistProfile[];
  max?: number;
  query: string;
  required?: boolean;
  showRecentQuickAdd?: boolean;
  hideSelectionChips?: boolean;
  focused?: boolean;
  onQueryChange: (query: string) => void;
  onSelect: (profile: ArtistProfile) => void;
  onRemove: (profileId: number) => void;
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "A"
  );
}

function ArtistAvatar({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  if (imageUrl) {
    return <img src={imageUrl} alt={name} loading="lazy" decoding="async" className="h-10 w-10 rounded-full object-cover" />;
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold" style={{ background: "var(--accent-soft)", color: "var(--text)" }}>
      {initials(name)}
    </div>
  );
}

export function ArtistPicker({
  label,
  helper,
  valueIds,
  max,
  query,
  required,
  showRecentQuickAdd = false,
  hideSelectionChips = false,
  focused = false,
  onQueryChange,
  onSelect,
  onRemove
}: ArtistPickerProps) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<ArtistProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [usage, setUsage] = useState({ currentCount: 0, allowedLimit: 0, canCreateMore: false });
  const [savedMatches, setSavedMatches] = useState<ArtistProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [profileStep, setProfileStep] = useState(0);
  const artistDialogRef = useAccessibleDialog(createOpen, () => setCreateOpen(false));
  const [createName, setCreateName] = useState("");
  const [spotifySearch, setSpotifySearch] = useState("");
  const [spotifyResults, setSpotifyResults] = useState<SpotifyArtistResult[]>([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [selectedSpotify, setSelectedSpotify] = useState<SpotifyArtistResult | null>(null);
  const [manualSpotifyUrl, setManualSpotifyUrl] = useState("");
  const [showManualSpotify, setShowManualSpotify] = useState(false);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [appleUrl, setAppleUrl] = useState("");
  const [isProducer, setIsProducer] = useState(false);
  const [producerLegalName, setProducerLegalName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ArtistProfile | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const reachedMax = Boolean(max && valueIds.length >= max);
  const profileSteps = ["name", "spotify", "instagram", "apple", "youtube", "producer", ...(isProducer ? ["legal"] : [])] as const;
  const activeProfileStep = profileSteps[Math.min(profileStep, profileSteps.length - 1)];
  const isFinalProfileStep = profileStep === profileSteps.length - 1;
  const hasQuery = Boolean(query.trim());
  const visibleSavedProfiles = hasQuery
    ? [...savedMatches, ...recent.filter((profile) => !savedMatches.some((match) => match.id === profile.id))]
    : recent;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open && !showRecentQuickAdd) return;

    setProfilesLoading(true);
    fetch("/api/artists")
      .then((response) => response.json())
      .then((data) => {
        setRecent(data.artists ?? []);
        setUsage({ currentCount: data.currentCount ?? 0, allowedLimit: data.allowedLimit ?? 0, canCreateMore: Boolean(data.canCreateMore) });
      })
      .catch(() => setRecent([]))
      .finally(() => setProfilesLoading(false));
  }, [open, showRecentQuickAdd]);

  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    if (!trimmed) {
      setSavedMatches([]);
      setSearchError(null);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchError(null);

      try {
        const savedResponse = await fetch(`/api/artists/search?q=${encodeURIComponent(trimmed)}`);
        const savedData = await savedResponse.json();
        if (!savedResponse.ok) {
          throw new Error(savedData.error || "Could not search saved artists.");
        }

        if (!active) return;
        setSavedMatches((savedData.profiles ?? []) as ArtistProfile[]);
      } catch (error) {
        if (!active) return;
        setSavedMatches([]);
        setSearchError(error instanceof Error ? error.message : "Artist search failed.");
      } finally {
        if (active) setLoading(false);
      }
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    if (!createOpen) return;
    if (selectedSpotify && spotifySearch.trim() === selectedSpotify.name.trim()) {
      setSpotifyResults([]);
      setSpotifyError(null);
      setSpotifyLoading(false);
      return;
    }

    const trimmed = spotifySearch.trim();
    if (!trimmed) {
      setSpotifyResults([]);
      setSpotifyError(null);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setSpotifyLoading(true);
      setSpotifyError(null);

      try {
        const response = await fetch(`/api/spotify/artists/search?q=${encodeURIComponent(trimmed)}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Spotify artist search failed.");
        }
        if (!active) return;
        setSpotifyResults((data.artists ?? []) as SpotifyArtistResult[]);
      } catch (error) {
        if (!active) return;
        setSpotifyResults([]);
        setSpotifyError(error instanceof Error ? error.message : "Spotify artist search failed.");
      } finally {
        if (active) setSpotifyLoading(false);
      }
    }, 240);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [createOpen, spotifySearch, selectedSpotify]);

  async function createProfile(input: {
    name: string;
    hasLiveMusic: boolean;
    spotifyUrl?: string;
    spotifyArtistId?: string;
    imageUrl?: string | null;
    followers?: number | null;
    confirmedSpotifyName?: string;
    appleUrl?: string;
    instagramUrl: string;
    youtubeUrl?: string;
    isProducer: boolean;
    producerLegalName?: string;
  }) {
    const response = await fetch("/api/artists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        hasLiveMusic: input.hasLiveMusic,
        spotifyUrl: input.spotifyUrl,
        spotifyArtistId: input.spotifyArtistId,
        imageUrl: input.imageUrl ?? undefined,
        followers: input.followers ?? null,
        confirmedSpotifyName: input.confirmedSpotifyName,
        appleUrl: input.appleUrl
        ,instagramUrl: input.instagramUrl
        ,youtubeUrl: input.youtubeUrl
        ,isProducer: input.isProducer
        ,producerLegalName: input.producerLegalName
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not create artist profile.");
    }
    return data.profile as ArtistProfile;
  }

  function selectSaved(profile: ArtistProfile) {
    onSelect(profile);
    setRecent((current) => [profile, ...current.filter((item) => item.id !== profile.id)].slice(0, 6));
    onQueryChange("");
    setOpen(false);
  }

  function openCreateModal() {
    const initialName = query.trim();
    setCreateName(initialName);
    setSpotifySearch(initialName);
    setSelectedSpotify(null);
    setManualSpotifyUrl("");
    setShowManualSpotify(false);
    setInstagramUrl("");
    setYoutubeUrl("");
    setIsProducer(false);
    setProducerLegalName("");
    setEditingProfile(null);
    setAppleUrl("");
    setSpotifyResults([]);
    setSpotifyError(null);
    setProfileStep(0);
    setCreateOpen(true);
    setOpen(false);
  }

  function openEditModal(profile: ArtistProfile) {
    setEditingProfile(profile);
    setCreateName(profile.name);
    setSpotifySearch(profile.name);
    setSelectedSpotify(null);
    setManualSpotifyUrl(profile.spotifyUrl ?? "");
    setShowManualSpotify(true);
    setInstagramUrl(profile.instagramUrl ?? "");
    setAppleUrl(profile.appleUrl ?? "");
    setYoutubeUrl(profile.youtubeUrl ?? "");
    setIsProducer(Boolean(profile.isProducer));
    setProducerLegalName(profile.producerLegalName ?? "");
    setSpotifyResults([]);
    setSpotifyError(null);
    setProfileStep(0);
    setCreateOpen(true);
    setOpen(false);
  }

  async function resolveSpotifyUrl(url: string) {
    const response = await fetch("/api/spotify/artists/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spotifyUrl: url.trim(), appleUrl: appleUrl.trim() || undefined })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not resolve the Spotify artist.");
    }
    return data.artist as SpotifyArtistResult;
  }

  async function saveArtist() {
    const name = createName.trim();
    if (!name) {
      setSpotifyError("Artist name is required.");
      return;
    }
    if (!instagramUrl.trim()) {
      setSpotifyError("Instagram profile link is required for artist verification.");
      return;
    }
    if (!selectedSpotify && !manualSpotifyUrl.trim()) {
      setSpotifyError("Select a Spotify artist or paste a valid Spotify artist profile link.");
      return;
    }
    if (isProducer && !producerLegalName.trim()) {
      setSpotifyError("Complete legal name is required for a producer profile.");
      return;
    }

    setSaving(true);
    setSpotifyError(null);

    try {
      if (editingProfile) {
        const response = await fetch(`/api/artists/${editingProfile.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, spotifyUrl: manualSpotifyUrl.trim(), instagramUrl: instagramUrl.trim(), appleUrl: appleUrl.trim(), youtubeUrl: youtubeUrl.trim(), isProducer, producerLegalName: isProducer ? producerLegalName.trim() : undefined }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not update artist profile.");
        const updated = data.profile as ArtistProfile;
        setRecent((current) => current.map((profile) => profile.id === updated.id ? updated : profile));
        onSelect(updated);
        setCreateOpen(false);
        return;
      }
      let spotifyArtist = selectedSpotify;
      if (!spotifyArtist && manualSpotifyUrl.trim()) {
        spotifyArtist = await resolveSpotifyUrl(manualSpotifyUrl);
        setCreateName(spotifyArtist.name);
      }

      const profile = await createProfile({
        name,
        hasLiveMusic: Boolean(spotifyArtist || manualSpotifyUrl.trim() || appleUrl.trim()),
        spotifyUrl: (spotifyArtist?.spotifyUrl ?? manualSpotifyUrl.trim()) || undefined,
        spotifyArtistId: spotifyArtist?.id,
        imageUrl: spotifyArtist?.imageUrl ?? null,
        followers: spotifyArtist?.followers ?? null,
        confirmedSpotifyName: spotifyArtist?.name ?? name,
        appleUrl: appleUrl.trim() || undefined
        ,instagramUrl: instagramUrl.trim()
        ,youtubeUrl: youtubeUrl.trim() || undefined
        ,isProducer
        ,producerLegalName: isProducer ? producerLegalName.trim() : undefined
      });
      onSelect(profile);
      setRecent((current) => [profile, ...current.filter((item) => item.id !== profile.id)].slice(0, 6));
      onQueryChange("");
      setCreateOpen(false);
      setOpen(false);
    } catch (error) {
      setSpotifyError(error instanceof Error ? error.message : "Could not save the artist.");
    } finally {
      setSaving(false);
    }
  }

  function advanceProfileStep() {
    setSpotifyError(null);
    if (activeProfileStep === "name" && !createName.trim()) return setSpotifyError("Artist name is required.");
    if (activeProfileStep === "spotify" && !selectedSpotify && !manualSpotifyUrl.trim()) return setSpotifyError("Select a Spotify artist or paste a valid Spotify artist profile link.");
    if (activeProfileStep === "instagram" && !instagramUrl.trim()) return setSpotifyError("Instagram profile link is required for artist verification.");
    if (activeProfileStep === "legal" && !producerLegalName.trim()) return setSpotifyError("Complete legal name is required for a producer profile.");
    setProfileStep((current) => Math.min(current + 1, profileSteps.length - 1));
  }

  return (
    <div ref={rootRef} className={`relative grid gap-2${focused ? " artist-picker-focused" : ""}`}>
      <div>
        <label className="px-[.8rem] text-sm font-medium" style={{ color: "var(--text-muted)" }}>
          {label}
        </label>
      </div>

      {focused ? <button type="button" className="artist-picker-add-trigger" disabled={reachedMax} onClick={() => setOpen((current) => !current)} aria-label={reachedMax ? "Maximum primary artists selected" : "Add primary artist"} aria-expanded={open}><Plus aria-hidden="true" /></button> : <input
        className="field"
        value={query}
        disabled={reachedMax}
        placeholder={reachedMax ? "Maximum reached" : focused ? "Add artist..." : `Search ${label.toLowerCase()}`}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
        }}
      />}

      <p className="px-[.8rem] text-xs leading-5" style={{ color: "var(--text-soft)" }}>
        {helper === "Max 3 artists" ? "Max 3 primary artists per release" : helper}
      </p>

      {showRecentQuickAdd && recent.length > 0 && !focused ? <div className="artist-picker-quick-add">
        <p>{focused ? "Last used" : "Recently used"}</p>
        <div>{recent.filter((profile) => !valueIds.some((selected) => selected.id === profile.id)).slice(0, 5).map((profile) => <button key={`quick-${profile.id}`} type="button" onClick={() => selectSaved(profile)}><ArtistAvatar name={profile.name} imageUrl={profile.imageUrl} /><span>{profile.name}</span><b aria-hidden="true">+</b></button>)}</div>
      </div> : null}

      {valueIds.length > 0 && !hideSelectionChips ? (
        <div className="flex flex-wrap gap-2">
          {valueIds.map((profile) => (
            <div key={profile.id} className="selection-chip">
              <ArtistAvatar name={profile.name} imageUrl={profile.imageUrl} />
              <span>{profile.name}</span>
              <button type="button" onClick={() => onRemove(profile.id)} style={{ color: "var(--text)" }}>
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {required && valueIds.length === 0 ? <p className="inline-error">Select at least one artist profile.</p> : null}

      {open && focused ? <button type="button" className="fixed inset-0 z-[90] cursor-default bg-black/65 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Close artist profile popup" /> : null}
      {open ? (
        <div role={focused ? "dialog" : undefined} aria-modal={focused ? "true" : undefined} aria-label={focused ? "Add artist profile" : undefined} className={`rounded-2xl border p-3 shadow-2xl ${focused ? "fixed left-1/2 top-1/2 z-[100] max-h-[min(42rem,86dvh)] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto" : "absolute top-full z-30 mt-2 w-full min-w-0 sm:min-w-[32rem]"}`} style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          {focused ? <div className="mb-3 flex items-center justify-between px-1"><div><p className="font-semibold" style={{ color: "var(--text)" }}>Add artist profile</p><p className="mt-0.5 text-xs" style={{ color: "var(--text-soft)" }}>Choose a saved profile or create a new one.</p></div><button type="button" className="rounded-full px-3 py-2 text-sm" onClick={() => setOpen(false)} aria-label="Close artist profile popup">×</button></div> : null}
          {focused ? <input className="field mb-3" autoFocus value={query} placeholder="Search saved artist profiles" onChange={(event) => onQueryChange(event.target.value)} /> : null}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <div><p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Saved artist profiles</p><p className="mt-0.5 text-xs" style={{ color: "var(--text-soft)" }}>{hasQuery ? "Matches first - all saved profiles remain available" : "Choose a profile for this release"}</p></div>
            <span className="shrink-0 rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>{`${usage.currentCount} of ${usage.allowedLimit} used`}</span>
          </div>
          {profilesLoading ? <p className="px-2 py-3 text-sm" style={{ color: "var(--text-soft)" }}>Loading saved profiles...</p> : null}
          {loading ? <p className="px-2 py-2 text-sm" style={{ color: "var(--text-soft)" }}>Searching artists...</p> : null}
          {searchError ? <p className="px-2 py-2 text-sm" style={{ color: "var(--danger)" }}>{searchError}</p> : null}

          {hasQuery && savedMatches.length === 0 && recent.length > 0 && !loading ? <p className="mb-2 rounded-lg px-2 py-2 text-xs" style={{color:"var(--text-muted)",background:"var(--bg-soft)"}}>No exact match. Showing all your saved profiles.</p> : null}

          {visibleSavedProfiles.length > 0 ? (
            <div className="grid gap-2">
              {visibleSavedProfiles.map((profile) => (
                <div key={`recent-${profile.id}`} className="grid w-full gap-3 rounded-xl border px-3 py-3 text-left sm:grid-cols-[auto,1fr,auto] sm:items-center" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}>
                  <ArtistAvatar name={profile.name} imageUrl={profile.imageUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{profile.name}</p><span className="status-pill text-[10px]">Primary artist</span></div>
                    <p className="truncate text-xs" style={{ color: "var(--text-soft)" }}>{[profile.spotifyUrl && "Spotify", profile.appleUrl && "Apple Music", profile.instagramUrl && "Instagram", profile.youtubeUrl && "YouTube"].filter(Boolean).join(" · ")}</p>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{profile.lastUsedAt ? `Last used ${new Date(profile.lastUsedAt).toLocaleDateString()}` : "Not used on a release yet"}</p>
                    {!profile.spotifyUrl || !profile.instagramUrl ? <p className="mt-1 text-xs" style={{ color: "var(--warning)" }}>Profile details need attention before delivery.</p> : null}
                  </div>
                  <div className="flex gap-2 sm:flex-col"><button type="button" className="btn-outline pressable min-h-11 px-3 py-2 text-xs" onClick={() => openEditModal(profile)}>Edit</button><button type="button" className="btn-primary pressable min-h-11 px-3 py-2 text-xs" onClick={() => selectSaved(profile)}>Use artist</button></div>
                </div>
              ))}
            </div>
          ) : null}

          {recent.length === 0 && !profilesLoading ? (
            <div className="rounded-xl border p-4" style={{borderColor:"var(--border)",background:"var(--card)"}}>
              <p className="font-medium" style={{color:"var(--text)"}}>Save your first artist profile</p>
              <p className="mt-1 text-sm leading-5" style={{color:"var(--text-muted)"}}>Create it once, then reuse the card on this and future releases.</p>
              <button type="button" disabled={!usage.canCreateMore} onClick={openCreateModal} className="btn-primary pressable mt-4 min-h-11 w-full disabled:cursor-not-allowed disabled:opacity-50">{query.trim() ? `Save "${query.trim()}" as an artist` : "Create artist profile"}</button>
            </div>
          ) : null}
          {recent.length > 0 ? <div className="mt-3 border-t pt-3" style={{borderColor:"var(--border)"}}><button type="button" disabled={!usage.canCreateMore} onClick={openCreateModal} className="flex min-h-11 w-full items-center justify-between rounded-xl border px-3 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}><span>Add another artist profile</span><span className="text-xs" style={{ color: "var(--text-soft)" }}>{usage.canCreateMore ? "New" : "Upgrade plan"}</span></button></div> : null}
          {!usage.canCreateMore && !profilesLoading ? <div className="mt-2 rounded-xl border p-3 text-xs" style={{borderColor:"rgba(250,204,21,0.35)",color:"var(--text-muted)"}}>Artist profile limit reached. You can keep using saved profiles or upgrade to create another.</div> : null}
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6" onMouseDown={(event) => { if (event.currentTarget === event.target) setCreateOpen(false); }}>
          <div ref={artistDialogRef as React.RefObject<HTMLDivElement | null>} role="dialog" aria-modal="true" aria-labelledby="artist-profile-dialog-title" tabIndex={-1} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[1.8rem] border p-6 shadow-2xl" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Primary Artist Profile</p>
                <h3 id="artist-profile-dialog-title" className="mt-3 text-2xl font-semibold" style={{ color: "var(--text)" }}>{editingProfile ? "Edit artist profile" : "Create new artist profile"}</h3>
                <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Find your Spotify artist profile, then add the identity links distribution partners need.</p>
              </div>
              <button type="button" className="btn-outline pressable" onClick={() => setCreateOpen(false)}>Close</button>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-soft)" }}><span>Step {profileStep + 1} of {profileSteps.length}</span><span>{Math.round(((profileStep + 1) / profileSteps.length) * 100)}%</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bg-soft)" }}><div className="h-full rounded-full transition-all duration-300" style={{ width: `${((profileStep + 1) / profileSteps.length) * 100}%`, background: "var(--accent)" }} /></div>
            </div>

            <div className="mt-8 min-h-[15rem]">
              {activeProfileStep === "name" ? <div><p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Identity</p><label className="mt-3 block text-xl font-semibold" style={{ color: "var(--text)" }}>What is the artist name?</label><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Use the exact public name shown on music services.</p><input autoFocus className="field mt-6" value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="Artist name" /></div> : null}

              {activeProfileStep === "spotify" ? <div><p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Spotify identity</p><label className="mt-3 block text-xl font-semibold" style={{ color: "var(--text)" }}>Find the Spotify artist profile</label><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Search and select the correct profile to prevent delivery to the wrong artist page.</p><input autoFocus className="field mt-6" value={spotifySearch} onChange={(event) => { setSpotifySearch(event.target.value); setSelectedSpotify(null); }} placeholder="Search Spotify artists" />{spotifyLoading ? <p className="mt-3 text-sm" style={{ color: "var(--text-soft)" }}>Searching Spotify...</p> : null}{selectedSpotify ? <div className="selection-chip mt-4 w-full justify-between"><span className="flex items-center gap-2"><ArtistAvatar name={selectedSpotify.name} imageUrl={selectedSpotify.imageUrl} /><span className="min-w-0 truncate">{selectedSpotify.name}</span></span><button type="button" className="text-xs" style={{ color: "var(--text-soft)" }} onClick={() => setSelectedSpotify(null)}>Clear</button></div> : null}{spotifyResults.length > 0 ? <div className="mt-3 grid max-h-48 gap-2 overflow-y-auto">{spotifyResults.map((artist) => <button key={artist.id} type="button" onClick={() => { setSelectedSpotify(artist); setCreateName(artist.name); setManualSpotifyUrl(artist.spotifyUrl); setSpotifySearch(artist.name); setSpotifyResults([]); setSpotifyError(null); }} className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}><ArtistAvatar name={artist.name} imageUrl={artist.imageUrl} /><div className="min-w-0 flex-1"><p className="truncate font-medium">{artist.name}</p><p className="truncate text-xs" style={{ color: "var(--text-soft)" }}>{artist.followers ? `${artist.followers.toLocaleString("en-IN")} followers` : "Spotify artist"}</p></div><span className="text-xs" style={{ color: "var(--text-soft)" }}>Select</span></button>)}</div> : null}<button type="button" className="mt-4 text-sm underline underline-offset-4" style={{ color: "var(--text-muted)" }} onClick={() => setShowManualSpotify((value) => !value)}>Not showing? Paste Spotify link</button>{showManualSpotify ? <input className="field mt-3" value={manualSpotifyUrl} onChange={(event) => setManualSpotifyUrl(event.target.value)} placeholder="https://open.spotify.com/artist/..." /> : null}</div> : null}

              {activeProfileStep === "instagram" ? <div><p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Verification</p><label className="mt-3 block text-xl font-semibold" style={{ color: "var(--text)" }}>Add the Instagram profile</label><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Required so HYMN and distribution partners can verify the artist identity.</p><input autoFocus className="field mt-6" required value={instagramUrl} onChange={(event) => setInstagramUrl(event.target.value)} placeholder="https://instagram.com/yourartistname" /></div> : null}
              {activeProfileStep === "apple" ? <div><p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Optional link</p><label className="mt-3 block text-xl font-semibold" style={{ color: "var(--text)" }}>Add the Apple Music profile</label><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Leave this blank if the artist does not have an Apple Music page yet.</p><input autoFocus className="field mt-6" value={appleUrl} onChange={(event) => setAppleUrl(event.target.value)} placeholder="https://music.apple.com/..." /></div> : null}
              {activeProfileStep === "youtube" ? <div><p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Optional link</p><label className="mt-3 block text-xl font-semibold" style={{ color: "var(--text)" }}>Add the YouTube channel</label><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Use the artist’s official channel when available.</p><input autoFocus className="field mt-6" value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="https://youtube.com/@artist" /></div> : null}
              {activeProfileStep === "producer" ? <div><p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Credits automation</p><h4 className="mt-3 text-xl font-semibold" style={{ color: "var(--text)" }}>Is this artist also a producer?</h4><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>When enabled, selecting this profile as a primary artist automatically adds its producer credit.</p><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" className={isProducer ? "btn-primary pressable" : "btn-outline pressable"} onClick={() => setIsProducer(true)}>Yes</button><button type="button" className={!isProducer ? "btn-primary pressable" : "btn-outline pressable"} onClick={() => { setIsProducer(false); setProducerLegalName(""); }}>No</button></div></div> : null}
              {activeProfileStep === "legal" ? <div><p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Producer credit</p><label className="mt-3 block text-xl font-semibold" style={{ color: "var(--text)" }}>What is the producer’s complete legal name?</label><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>This name will be inserted into contribution credits, not displayed as the public artist name.</p><input autoFocus className="field mt-6" required value={producerLegalName} onChange={(event) => setProducerLegalName(event.target.value)} placeholder="Complete legal name" /></div> : null}

              {spotifyError ? <p className="mt-5 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "color-mix(in srgb, var(--danger) 45%, var(--border))", color: "var(--danger)" }}>{spotifyError}</p> : null}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 border-t pt-5" style={{ borderColor: "var(--border)" }}>
              <button type="button" className="btn-outline pressable" onClick={() => profileStep > 0 ? setProfileStep((current) => current - 1) : setCreateOpen(false)}>{profileStep > 0 ? "Back" : "Cancel"}</button>
              {isFinalProfileStep ? <button type="button" className="btn-primary pressable" onClick={() => void saveArtist()} disabled={saving}>{saving ? "Saving..." : editingProfile ? "Save changes" : "Create profile"}</button> : <button type="button" className="btn-primary pressable" onClick={advanceProfileStep}>{activeProfileStep === "apple" || activeProfileStep === "youtube" ? (activeProfileStep === "apple" && appleUrl.trim()) || (activeProfileStep === "youtube" && youtubeUrl.trim()) ? "Continue" : "Skip" : "Continue"}</button>}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


// vercel trigger

// vercel trigger 2

// vercel trigger 11

// vercel trigger 12
