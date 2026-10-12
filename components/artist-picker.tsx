"use client";

import { customerMessage } from "@/lib/customer-message";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Music2, Pencil, Plus, Search, UserRound, X } from "lucide-react";
import type { ArtistProfile, SpotifyArtistResult } from "@/lib/types";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";
import "./artist-picker.css";

function ArtistPickerLayer({ children, portal }: { children: React.ReactNode; portal: boolean }) {
  return portal ? createPortal(<div data-artist-picker-layer style={{ display: "contents" }}>{children}</div>, document.body) : children;
}

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
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (imageUrl && imageUrl !== failedUrl) {
    return <Image src={imageUrl} alt={name} width={40} height={40} sizes="40px" onError={() => setFailedUrl(imageUrl)} className="h-10 w-10 rounded-full object-cover" />;
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold" style={{ background: "var(--accent-soft)", color: "var(--text)" }}>
      {initials(name)}
    </div>
  );
}

function ArtistPlatformLinks({ profile }: { profile: Pick<ArtistProfile, "spotifyUrl" | "appleUrl" | "instagramUrl"> }) {
  const links = [
    { name: "Spotify", url: profile.spotifyUrl, icon: "spotify" },
    { name: "Apple Music", url: profile.appleUrl, icon: "apple" },
    { name: "Instagram", url: profile.instagramUrl, icon: "instagram" }
  ];
  return <div className="artist-platform-links">{links.filter(link => link.url).map(link => <a key={link.name} href={link.name === "Instagram" && !link.url?.startsWith("http") ? `https://www.instagram.com/${link.url?.replace(/^@/, "")}` : link.url!} target="_blank" rel="noopener noreferrer" aria-label={`Open ${link.name} profile`} title={link.name}><Image src={`/assets/store-logos/symbol-${link.icon}.png`} width={20} height={20} alt="" /></a>)}</div>;
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
  const libraryDialogRef = useAccessibleDialog(open && focused, () => setOpen(false));
  const [recent, setRecent] = useState<ArtistProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [usage, setUsage] = useState({ currentCount: 0, allowedLimit: 0, canCreateMore: false });
  const [savedMatches, setSavedMatches] = useState<ArtistProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [profileStep, setProfileStep] = useState(0);
  const dialogTitleId = useId();
  const artistDialogRef = useAccessibleDialog(createOpen, () => { if (!saving) setCreateOpen(false); });
  const [createName, setCreateName] = useState("");
  const [spotifySearch, setSpotifySearch] = useState("");
  const [spotifyResults, setSpotifyResults] = useState<SpotifyArtistResult[]>([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [selectedSpotify, setSelectedSpotify] = useState<SpotifyArtistResult | null>(null);
  const [manualSpotifyUrl, setManualSpotifyUrl] = useState("");
  const [showManualSpotify, setShowManualSpotify] = useState(false);
  const [hasLiveMusic, setHasLiveMusic] = useState<boolean | null>(null);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [appleUrl, setAppleUrl] = useState("");
  const [isProducer, setIsProducer] = useState(false);
  const [producerLegalName, setProducerLegalName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ArtistProfile | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const reachedMax = Boolean(max && valueIds.length >= max);
  const profileSteps = ["liveMusic", "name", ...(hasLiveMusic ? ["spotify", "apple", "instagram", "youtube", "producer", ...(isProducer ? ["legal"] : [])] : ["instagram"])];
  const activeProfileStep = profileSteps[Math.min(profileStep, profileSteps.length - 1)];
  const isFinalProfileStep = profileStep === profileSteps.length - 1;
  const hasQuery = Boolean(query.trim());
  const visibleSavedProfiles = hasQuery
    ? [...savedMatches, ...recent.filter((profile) => !savedMatches.some((match) => match.id === profile.id))]
    : recent;

  useEffect(() => {
    if (!createOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [createOpen]);

  useEffect(() => {
    setSpotifyError(null);
  }, [profileStep]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (event.target instanceof Element && event.target.closest("[data-artist-picker-layer]")) return;
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
    if (!createOpen || activeProfileStep !== "spotify") return;
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
  }, [createOpen, activeProfileStep, spotifySearch, selectedSpotify]);

  async function createProfile(input: {
    name: string;
    hasLiveMusic: boolean;
    spotifyUrl?: string;
    spotifyArtistId?: string;
    imageUrl?: string | null;
    followers?: number | null;
    confirmedSpotifyName?: string;
    appleUrl?: string;
    instagramUrl?: string;
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
    setHasLiveMusic(null);
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
    setShowManualSpotify(Boolean(profile.spotifyUrl));
    setHasLiveMusic(Boolean(profile.isLinked));
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
    if (hasLiveMusic && !selectedSpotify && !manualSpotifyUrl.trim() && !appleUrl.trim()) {
      setSpotifyError("Select a Spotify artist, paste a valid Spotify artist profile link, or add an Apple Music profile.");
      return;
    }
    if (hasLiveMusic && isProducer && !producerLegalName.trim()) {
      setSpotifyError("Complete legal name is required for a producer profile.");
      return;
    }

    setSaving(true);
    setSpotifyError(null);

    try {
      if (editingProfile) {
        const response = await fetch(`/api/artists/${editingProfile.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(hasLiveMusic ? { name, hasLiveMusic, spotifyUrl: selectedSpotify?.spotifyUrl ?? manualSpotifyUrl.trim(), instagramUrl: instagramUrl.trim(), appleUrl: appleUrl.trim(), youtubeUrl: youtubeUrl.trim(), isProducer, producerLegalName: isProducer ? producerLegalName.trim() : undefined } : { name, hasLiveMusic: false, instagramUrl: instagramUrl.trim() }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not update artist profile.");
        const updated = data.profile as ArtistProfile;
        setRecent((current) => current.map((profile) => profile.id === updated.id ? updated : profile));
        onSelect(updated);
        setCreateOpen(false);
        return;
      }
      let spotifyArtist = selectedSpotify;
      if (hasLiveMusic && !spotifyArtist && manualSpotifyUrl.trim()) {
        spotifyArtist = await resolveSpotifyUrl(manualSpotifyUrl);
        setCreateName(spotifyArtist.name);
      }

      const profile = await createProfile({
        name: spotifyArtist?.name ?? name,
        hasLiveMusic: Boolean(hasLiveMusic),
        spotifyUrl: hasLiveMusic ? (spotifyArtist?.spotifyUrl ?? manualSpotifyUrl.trim()) || undefined : undefined,
        spotifyArtistId: hasLiveMusic ? spotifyArtist?.id : undefined,
        imageUrl: spotifyArtist?.imageUrl ?? null,
        followers: spotifyArtist?.followers ?? null,
        confirmedSpotifyName: spotifyArtist?.name ?? name,
        appleUrl: hasLiveMusic ? appleUrl.trim() || undefined : undefined,
        instagramUrl: instagramUrl.trim(),
        youtubeUrl: hasLiveMusic ? youtubeUrl.trim() || undefined : undefined,
        isProducer: Boolean(hasLiveMusic && isProducer),
        producerLegalName: hasLiveMusic && isProducer ? producerLegalName.trim() : undefined
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
    if (activeProfileStep === "liveMusic" && hasLiveMusic === null) return setSpotifyError("Choose whether this artist already has store profiles.");
    if (activeProfileStep === "apple" && !selectedSpotify && !manualSpotifyUrl.trim() && !appleUrl.trim()) return setSpotifyError("Add a Spotify or Apple Music artist profile, or go back and choose first release.");
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

      {open ? (
        <ArtistPickerLayer portal={focused}>
        {focused ? <button type="button" className="fixed inset-0 z-[90] cursor-default bg-black/65 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Close artist profile popup" /> : null}
        <div ref={focused ? libraryDialogRef as React.RefObject<HTMLDivElement | null> : undefined} tabIndex={focused ? -1 : undefined} role={focused ? "dialog" : undefined} aria-modal={focused ? "true" : undefined} aria-label="Add artist profile" className={`artist-library ${focused ? "is-focused" : "is-inline"}`}>
          <div className="artist-library-heading"><div><h3>Add artist</h3><span>{usage.currentCount} / {usage.allowedLimit} profiles</span></div><button type="button" onClick={() => setOpen(false)} aria-label="Close artist profile popup"><X size={19} /></button></div>
          <label className="artist-library-search"><Search size={18} aria-hidden="true" /><input data-autofocus autoFocus={focused} value={query} aria-label="Search artist profiles" placeholder="Find your artist" onChange={event => onQueryChange(event.target.value)} /></label>
          {profilesLoading || loading ? <div className="artist-library-loading" role="status"><LoaderCircle size={20} className="animate-spin" /><span>Loading artists</span></div> : null}
          {searchError ? <p role="alert" className="inline-error">{customerMessage(searchError)}</p> : null}
          {hasQuery && savedMatches.length === 0 && recent.length > 0 && !loading ? <p className="artist-library-hint">No match. Your saved artists:</p> : null}
          <div className="artist-library-list">{visibleSavedProfiles.map(profile => {
            const selected = valueIds.some(artist => artist.id === profile.id);
            return <div key={profile.id} className="artist-library-row">
              <button type="button" className="artist-library-select" onClick={() => selectSaved(profile)} disabled={selected || reachedMax} aria-label={selected ? `${profile.name} selected` : `Select ${profile.name}`}><ArtistAvatar name={profile.name} imageUrl={profile.imageUrl} /><span>{profile.name}</span><span className="artist-library-select-icon">{selected ? <Check size={18} /> : <Plus size={18} />}</span></button>
              <div className="artist-library-row-details"><ArtistPlatformLinks profile={profile} /><button type="button" className="artist-library-edit" onClick={() => openEditModal(profile)} aria-label={`Edit ${profile.name}`} title="Edit artist"><Pencil size={16} /></button></div>
            </div>;
          })}</div>
          {recent.length === 0 && !profilesLoading ? <div className="artist-library-empty"><UserRound size={30} /><p>Your artist starts here</p></div> : null}
          <button type="button" className="artist-library-new" disabled={!usage.canCreateMore || profilesLoading} onClick={openCreateModal}><Plus size={19} /><span>New artist</span><ArrowRight size={18} /></button>
          {!usage.canCreateMore && !profilesLoading ? <p className="artist-library-hint">Profile limit reached. Use a saved artist or upgrade.</p> : null}
        </div>
        </ArtistPickerLayer>
      ) : null}

      {createOpen ? createPortal(
        <div className="artist-profile-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setCreateOpen(false); }}>
          <div ref={artistDialogRef as React.RefObject<HTMLDivElement | null>} role="dialog" aria-modal="true" aria-labelledby={dialogTitleId} tabIndex={-1} className="artist-profile-modal" aria-busy={saving}>
            <div className="artist-profile-modal-header">
            <div className="flex items-start justify-between gap-4">
              <div>

                <h3 id={dialogTitleId} className="mt-2 text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>{editingProfile ? "Edit artist profile" : "Create artist profile"}</h3>
                <div className="artist-profile-live-identity"><ArtistAvatar name={createName || "Artist"} imageUrl={selectedSpotify?.imageUrl || editingProfile?.imageUrl} /><span>{createName || "Your artist"}</span><ArtistPlatformLinks profile={{ spotifyUrl: selectedSpotify?.spotifyUrl || manualSpotifyUrl, appleUrl, instagramUrl }} /></div>
              </div>
              <button type="button" className="artist-profile-close" aria-label="Close artist profile" disabled={saving} onClick={() => setCreateOpen(false)}><X size={18} /></button>
            </div>

            <div className="artist-profile-steps" aria-label="Profile progress">{profileSteps.map((stage, index) => <span key={stage} className={index === profileStep ? "is-current" : index < profileStep ? "is-complete" : ""} aria-current={index === profileStep ? "step" : undefined} title={stage === "liveMusic" ? "Artist type" : stage === "legal" ? "Legal name" : stage}><span>{index < profileStep ? <Check size={14} /> : ["spotify", "apple", "instagram"].includes(stage) ? <Image src={`/assets/store-logos/symbol-${stage}.png`} alt={stage} width={16} height={16} /> : stage === "name" ? <UserRound size={16} /> : stage === "liveMusic" ? <Music2 size={16} /> : <span>{index + 1}</span>}</span></span>)}</div>
            </div>

            <div className="artist-profile-modal-body" key={activeProfileStep}>
              {activeProfileStep === "liveMusic" ? <div>
                <h4 className="text-xl font-semibold tracking-tight">Already on streaming?</h4>

                <div className="mt-6 grid gap-3" role="group" aria-label="Existing store profiles">
                  {[{ value: true, title: "Existing artist", description: "Connect store profiles", icon: Music2 }, { value: false, title: "First release", description: "Create a new identity", icon: UserRound }].map(({ value, title, description, icon: Icon }) => <button key={String(value)} type="button" className="artist-profile-choice" aria-pressed={hasLiveMusic === value} onClick={() => { setHasLiveMusic(value); setSpotifyError(null); if (!value) { setSelectedSpotify(null); setManualSpotifyUrl(""); setAppleUrl(""); setSpotifyResults([]); } }}><span className="artist-profile-choice-icon"><Icon size={21} /></span><span className="flex-1"><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs leading-5" style={{ color: "var(--text-muted)" }}>{description}</span></span><span className="artist-profile-choice-check">{hasLiveMusic === value ? <Check size={14} /> : null}</span></button>)}
                </div>
              </div> : null}
              {activeProfileStep === "name" ? <div><p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Artist identity</p><label htmlFor={`${dialogTitleId}-name`} className="mt-2 block text-xl font-semibold">Artist name</label><p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{hasLiveMusic ? "Match your store name." : "Your public artist name."}</p><input id={`${dialogTitleId}-name`} autoFocus className="field mt-6" maxLength={150} value={createName} onChange={(event) => { setCreateName(event.target.value); setSpotifyError(null); }} onKeyDown={(event) => { if (event.key === "Enter" && !saving) { event.preventDefault(); if (isFinalProfileStep) void saveArtist(); else advanceProfileStep(); } }} placeholder="Artist name" />{!hasLiveMusic ? <div className="mt-5 rounded-xl border p-4 text-sm leading-6" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>Store profiles are created with your first release.</div> : null}</div> : null}

              {activeProfileStep === "spotify" ? <div><p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Spotify identity</p><label className="mt-3 block text-xl font-semibold" style={{ color: "var(--text)" }}>Find your Spotify</label><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Choose your official artist page.</p><input autoFocus className="field mt-6" value={spotifySearch} onChange={(event) => { setSpotifySearch(event.target.value); setSelectedSpotify(null); }} placeholder="Search Spotify artists" />{spotifyLoading ? <p className="mt-3 text-sm" style={{ color: "var(--text-soft)" }}>Searching Spotify...</p> : null}{selectedSpotify ? <div className="selection-chip mt-4 w-full justify-between"><span className="flex items-center gap-2"><ArtistAvatar name={selectedSpotify.name} imageUrl={selectedSpotify.imageUrl} /><span className="min-w-0 truncate">{selectedSpotify.name}</span></span><button type="button" className="text-xs" style={{ color: "var(--text-soft)" }} onClick={() => setSelectedSpotify(null)}>Clear</button></div> : null}{spotifyResults.length > 0 ? <div className="mt-3 grid max-h-48 gap-2 overflow-y-auto">{spotifyResults.map((artist) => <button key={artist.id} type="button" onClick={() => { setSelectedSpotify(artist); setCreateName(artist.name); setManualSpotifyUrl(artist.spotifyUrl); setSpotifySearch(artist.name); setSpotifyResults([]); setSpotifyError(null); }} className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}><ArtistAvatar name={artist.name} imageUrl={artist.imageUrl} /><div className="min-w-0 flex-1"><p className="truncate font-medium">{artist.name}</p><p className="truncate text-xs" style={{ color: "var(--text-soft)" }}>{artist.followers ? `${artist.followers.toLocaleString("en-IN")} followers` : "Spotify artist"}</p></div><span className="text-xs" style={{ color: "var(--text-soft)" }}>Select</span></button>)}</div> : null}<button type="button" className="mt-4 text-sm underline underline-offset-4" style={{ color: "var(--text-muted)" }} onClick={() => setShowManualSpotify((value) => !value)}>Paste a link</button>{showManualSpotify ? <input className="field mt-3" value={manualSpotifyUrl} onChange={(event) => setManualSpotifyUrl(event.target.value)} placeholder="https://open.spotify.com/artist/..." /> : null}</div> : null}

              {activeProfileStep === "instagram" ? <div><p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Verification</p><label htmlFor={`${dialogTitleId}-instagram`} className="mt-2 block text-lg font-semibold" style={{ color: "var(--text)" }}>Add the Instagram profile</label><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Required for verification. @handle or link.</p><input id={`${dialogTitleId}-instagram`} autoFocus className="field mt-4" required value={instagramUrl} onChange={(event) => setInstagramUrl(event.target.value)} placeholder="https://instagram.com/yourartistname" /></div> : null}
              {activeProfileStep === "apple" ? <div><p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Optional link</p><label className="mt-2 block text-lg font-semibold" style={{ color: "var(--text)" }}>Add the Apple Music profile</label><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Optional. Add it later.</p><input autoFocus className="field mt-4" value={appleUrl} onChange={(event) => setAppleUrl(event.target.value)} placeholder="https://music.apple.com/..." /></div> : null}
              {activeProfileStep === "youtube" ? <div><p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Optional link</p><label className="mt-2 block text-lg font-semibold" style={{ color: "var(--text)" }}>Add the YouTube channel</label><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Use the artist’s official channel when available.</p><input autoFocus className="field mt-4" value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="https://youtube.com/@artist" /></div> : null}
              {activeProfileStep === "producer" ? <div><p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Credits automation</p><h4 className="mt-2 text-lg font-semibold" style={{ color: "var(--text)" }}>Also a producer?</h4><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Add producer credits automatically.</p><div className="mt-4 grid grid-cols-2 gap-3"><button type="button" className={isProducer ? "btn-primary pressable" : "btn-outline pressable"} onClick={() => setIsProducer(true)}>Yes</button><button type="button" className={!isProducer ? "btn-primary pressable" : "btn-outline pressable"} onClick={() => { setIsProducer(false); setProducerLegalName(""); }}>No</button></div></div> : null}
              {activeProfileStep === "legal" ? <div><p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Producer credit</p><label className="mt-2 block text-lg font-semibold" style={{ color: "var(--text)" }}>What is the producer’s complete legal name?</label><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>For credits only.</p><input autoFocus className="field mt-4" required value={producerLegalName} onChange={(event) => setProducerLegalName(event.target.value)} placeholder="Complete legal name" /></div> : null}

              {spotifyError ? <p role="alert" className="mt-5 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "color-mix(in srgb, var(--danger) 45%, var(--border))", color: "var(--danger)" }}>{customerMessage(spotifyError)}</p> : null}
            </div>

            <div className="artist-profile-modal-footer">
              <button type="button" className="btn-outline pressable" disabled={saving} onClick={() => { setSpotifyError(null); if (profileStep > 0) setProfileStep((current) => current - 1); else setCreateOpen(false); }}><ArrowLeft size={18} /><span>{profileStep > 0 ? "Back" : "Cancel"}</span></button>
              {isFinalProfileStep ? <button type="button" className="btn-primary pressable" onClick={() => void saveArtist()} disabled={saving || !createName.trim()}>{saving ? "Saving..." : editingProfile ? "Save changes" : "Create profile"}</button> : <button type="button" className="btn-primary pressable flex items-center gap-2" disabled={activeProfileStep === "liveMusic" && hasLiveMusic === null} onClick={advanceProfileStep}>{activeProfileStep === "youtube" && !youtubeUrl.trim() ? "Skip" : "Next"}<ArrowRight size={16} /></button>}
            </div>
          </div>
        </div>
      , document.body) : null}
    </div>
  );
}


// vercel trigger

// vercel trigger 2

// vercel trigger 11

// vercel trigger 12
