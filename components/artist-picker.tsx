"use client";

import { useEffect, useRef, useState } from "react";
import type { ArtistProfile, SpotifyArtistResult } from "@/lib/types";

type ArtistPickerProps = {
  label: string;
  helper: string;
  valueIds: ArtistProfile[];
  max?: number;
  query: string;
  required?: boolean;
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
    return <img src={imageUrl} alt={name} className="h-10 w-10 rounded-full object-cover" />;
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
  onQueryChange,
  onSelect,
  onRemove
}: ArtistPickerProps) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<ArtistProfile[]>([]);
  const [usage, setUsage] = useState({ currentCount: 0, allowedLimit: 0, canCreateMore: false });
  const [savedMatches, setSavedMatches] = useState<ArtistProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
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
  const [saving, setSaving] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ArtistProfile | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const reachedMax = Boolean(max && valueIds.length >= max);
  const visibleSavedProfiles = query.trim() ? savedMatches : recent;

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
    if (!open) return;

    fetch("/api/artists")
      .then((response) => response.json())
      .then((data) => {
        setRecent(data.artists ?? []);
        setUsage({ currentCount: data.currentCount ?? 0, allowedLimit: data.allowedLimit ?? 0, canCreateMore: Boolean(data.canCreateMore) });
      })
      .catch(() => setRecent([]));
  }, [open]);

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
    setEditingProfile(null);
    setAppleUrl("");
    setSpotifyResults([]);
    setSpotifyError(null);
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
    setSpotifyResults([]);
    setSpotifyError(null);
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

    setSaving(true);
    setSpotifyError(null);

    try {
      if (editingProfile) {
        const response = await fetch(`/api/artists/${editingProfile.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, spotifyUrl: manualSpotifyUrl.trim(), instagramUrl: instagramUrl.trim(), appleUrl: appleUrl.trim(), youtubeUrl: youtubeUrl.trim() }) });
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

  return (
    <div ref={rootRef} className="relative grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
          {label}
        </label>
        <span className="text-xs" style={{ color: "var(--text-soft)" }}>
          {helper === "Max 3 artists" ? "Max 3 primary artists per release" : helper}
        </span>
      </div>

      <input
        className="field"
        value={query}
        disabled={reachedMax}
        placeholder={reachedMax ? "Maximum reached" : `Search ${label.toLowerCase()}`}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
        }}
      />

      {valueIds.length > 0 ? (
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

      {open ? (
        <div className="absolute top-full z-30 mt-2 w-full rounded-[1.6rem] border p-3 shadow-2xl" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          <div className="mb-3 px-2"><div className="flex items-center justify-between gap-3"><p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>Saved Artist Profiles</p><span className="text-xs" style={{ color: "var(--text-soft)" }}>{`Artist profiles used: ${usage.currentCount}/${usage.allowedLimit}`}</span></div><p className="mt-1 text-xs" style={{color:"var(--text-muted)"}}>Select a saved Primary Artist Profile for this release.</p></div>
          {loading ? <p className="px-2 py-2 text-sm" style={{ color: "var(--text-soft)" }}>Searching artists...</p> : null}
          {searchError ? <p className="px-2 py-2 text-sm" style={{ color: "var(--danger)" }}>{searchError}</p> : null}

          {visibleSavedProfiles.length > 0 ? (
            <div className="grid gap-2">
              {visibleSavedProfiles.map((profile) => (
                <div key={`recent-${profile.id}`} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left" style={{ background: "var(--card)", color: "var(--text)" }}>
                  <ArtistAvatar name={profile.name} imageUrl={profile.imageUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{profile.name}</p>
                    <p className="truncate text-xs" style={{ color: "var(--text-soft)" }}>{[profile.spotifyUrl && "Spotify", profile.appleUrl && "Apple Music", profile.instagramUrl && "Instagram", profile.youtubeUrl && "YouTube"].filter(Boolean).join(" · ")}</p>
                  </div>
                  <button type="button" className="text-xs" style={{ color: "var(--text-soft)" }} onClick={() => openEditModal(profile)}>Edit</button>
                  <button type="button" className="btn-outline pressable px-3 py-2 text-xs" onClick={() => selectSaved(profile)}>Use this artist</button>
                </div>
              ))}
            </div>
          ) : null}

          {query.trim() && savedMatches.length === 0 && !loading ? <div className="mt-2 rounded-xl border p-3" style={{borderColor:"var(--border)",background:"var(--card)"}}><p className="text-sm" style={{color:"var(--text-muted)"}}>No saved artist profiles match this search.</p><button type="button" className="mt-2 text-xs underline underline-offset-4" onClick={()=>onQueryChange("")}>Clear search to view saved profiles</button></div> : null}
          {!query.trim() && recent.length === 0 && !loading ? <p className="px-2 py-2 text-sm" style={{color:"var(--text-muted)"}}>No saved artist profile yet. Create your first Primary Artist Profile Card to continue.</p> : null}
          <div className="mt-3 border-t pt-3" style={{borderColor:"var(--border)"}}><button type="button" disabled={!usage.canCreateMore} onClick={openCreateModal} className="flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}><span>Create new artist profile</span><span className="text-xs" style={{ color: "var(--text-soft)" }}>{usage.canCreateMore ? "New" : "Upgrade plan"}</span></button>{!usage.canCreateMore ? <div className="mt-2 rounded-xl border p-3 text-xs" style={{borderColor:"rgba(250,204,21,0.35)",color:"var(--text-muted)"}}><p>Artist profile limit reached. You can still use saved artist profiles, but you need to upgrade to create more.</p><p className="mt-1">Limit reached. Upgrade to create more artist profiles.</p></div> : null}</div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[1.8rem] border p-6 shadow-2xl" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Primary Artist Profile</p>
                <h3 className="mt-3 text-2xl font-semibold" style={{ color: "var(--text)" }}>{editingProfile ? "Edit artist profile" : "Create new artist profile"}</h3>
                <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Find your Spotify artist profile, then add the identity links distribution partners need.</p>
              </div>
              <button type="button" className="btn-outline pressable" onClick={() => setCreateOpen(false)}>Close</button>
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>Artist Name</label>
                <input className="field" value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="Artist name" />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>Spotify search</label>
                <input className="field" value={spotifySearch} onChange={(event) => { setSpotifySearch(event.target.value); setSelectedSpotify(null); }} placeholder="Search Spotify artists" />
              </div>

              {spotifyLoading ? <p className="text-sm" style={{ color: "var(--text-soft)" }}>Searching Spotify...</p> : null}
              {spotifyError ? <p className="text-sm" style={{ color: "var(--danger)" }}>{spotifyError}</p> : null}

              {selectedSpotify ? (
                <div className="selection-chip w-full justify-between">
                  <span className="flex items-center gap-2">
                    <ArtistAvatar name={selectedSpotify.name} imageUrl={selectedSpotify.imageUrl} />
                    <span className="min-w-0 truncate">{selectedSpotify.name}</span>
                  </span>
                  <button type="button" className="text-xs" style={{ color: "var(--text-soft)" }} onClick={() => setSelectedSpotify(null)}>Clear</button>
                </div>
              ) : null}

              {spotifyResults.length > 0 ? (
                <div className="grid gap-2">
                  {spotifyResults.map((artist) => (
                    <button key={artist.id} type="button" onClick={() => { setSelectedSpotify(artist); setCreateName(artist.name); setManualSpotifyUrl(artist.spotifyUrl); setSpotifySearch(artist.name); setSpotifyResults([]); setSpotifyError(null); }} className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}>
                      <ArtistAvatar name={artist.name} imageUrl={artist.imageUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{artist.name}</p>
                        <p className="truncate text-xs" style={{ color: "var(--text-soft)" }}>{artist.followers ? `${artist.followers.toLocaleString("en-IN")} followers` : "Spotify artist"}</p>
                      </div>
                      <span className="text-xs" style={{ color: "var(--text-soft)" }}>Select</span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div><button type="button" className="text-sm underline underline-offset-4" style={{ color: "var(--text-muted)" }} onClick={() => setShowManualSpotify((value) => !value)}>Not showing? Paste Spotify link</button></div>
              {showManualSpotify ? <div><label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>Spotify Artist Profile Link</label><input className="field" value={manualSpotifyUrl} onChange={(event) => setManualSpotifyUrl(event.target.value)} placeholder="https://open.spotify.com/artist/..." /></div> : null}

              <div><label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>Instagram Profile Link *</label><input className="field" required value={instagramUrl} onChange={(event) => setInstagramUrl(event.target.value)} placeholder="https://instagram.com/yourartistname" /><p className="mt-2 text-xs" style={{ color: "var(--text-soft)" }}>Instagram is required so HYMN and distribution partners can verify or create the artist profile if needed.</p></div>

              <div>
                <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>Apple Music link</label>
                <input className="field" value={appleUrl} onChange={(event) => setAppleUrl(event.target.value)} placeholder="Optional Apple Music artist link" />
              </div>
              <div><label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>YouTube Link</label><input className="field" value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="Optional YouTube artist link" /></div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button type="button" className="btn-outline pressable" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="button" className="btn-primary pressable" onClick={() => void saveArtist()} disabled={saving}>{saving ? "Saving..." : "Save Artist Card"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


// vercel trigger

// vercel trigger 2
