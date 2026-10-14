"use client";
import { useState } from "react";
import { ArrowUpRight, ImagePlus, Music2, Users, Tags } from "lucide-react";
import { artworkPreviewUrl } from "@/lib/artwork-preview";

export function CuratorPlaylistApplication({ busy, onSubmit }: { busy: boolean; onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void> }) {
  const [coverUrl, setCoverUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true); setError(""); setCoverUrl("");
    try {
      const form = new FormData(); form.set("image", file);
      const response = await fetch("/api/playlist-reviews/cover", { method: "POST", body: form });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Cover upload failed.");
      setCoverUrl(value.url);
    } catch (error) { setError(error instanceof Error ? error.message : "Please try again."); }
    finally { setUploading(false); }
  }
  return <form className="playlist-form curator-application" onSubmit={async event => { if (!coverUrl || uploading) { event.preventDefault(); setError("Upload your playlist cover before applying."); return; } await onSubmit(event); }}>
    <h3>Give your playlist a home.</h3><p>Show artists what fits your audience. Your listing opens after HYMN reviews ownership.</p>
    <div className="curator-profile-layout"><label className="curator-cover-upload">{coverUrl ? <img src={artworkPreviewUrl(coverUrl, 320)} alt="Your playlist cover preview" width={160} height={160} /> : <ImagePlus size={36} />}<strong>{uploading ? "Uploading…" : coverUrl ? "Change cover" : "Upload playlist cover"}</strong><small>Square JPG, PNG or WebP · up to 5 MB</small><input aria-label="Playlist cover image" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || uploading} onChange={event => void upload(event.target.files?.[0])} /><input name="coverUrl" type="hidden" value={coverUrl} /></label>
    <div className="playlist-form-grid"><label>Playlist name<input name="name" placeholder="Your playlist’s name" required minLength={3} maxLength={90} /></label><label>Spotify playlist link<input name="playlistUrl" type="url" placeholder="https://open.spotify.com/playlist/…" required /></label>
    <label><span><Music2 size={14} /> Genres</span><input name="genres" placeholder="Indie pop, alternative, folk" required minLength={3} maxLength={160} /></label><label><span><Tags size={14} /> Moods & activities</span><input name="moods" placeholder="Late night, uplifting, road trip" required minLength={3} maxLength={120} /></label>
    <label>Song languages<input name="languages" placeholder="Hindi, English, instrumental" required minLength={2} maxLength={120} /></label><label><span><Users size={14} /> Who listens?</span><input name="audience" placeholder="Fans of mellow independent music" required minLength={10} maxLength={240} /></label>
    <label>Review fee (₹)<input name="feeRupees" type="number" min={10} max={10000} step={1} defaultValue={50} required /></label><label>Maximum active reviews<input name="capacity" type="number" min={1} max={100} defaultValue={20} required /></label>
    <label className="playlist-full">What makes a good fit?<textarea name="description" placeholder="Describe your sound, the tracks you welcome, and what artists can expect from your feedback." required minLength={30} maxLength={800} /></label></div></div>
    {error ? <p role="alert">{error}</p> : null}
    <label className="playlist-check"><input name="ownershipConfirmed" type="checkbox" required />I control this playlist, will personally listen and respond within seven days, prohibit artificial streams, and accept the <a href="/playlist-review-terms" target="_blank" rel="noreferrer">curator terms</a>.</label>
    <button className="playlist-primary" disabled={busy || uploading || !coverUrl}>Apply to curate <ArrowUpRight size={16} /></button>
  </form>;
}
