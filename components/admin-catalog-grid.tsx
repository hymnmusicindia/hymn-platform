"use client";
import type { Release, Beat } from "@/lib/types";
import { artworkPreviewUrl } from "@/lib/artwork-preview";
import styles from "./admin-catalog-grid.module.css";
export function AdminCatalogGrid({ releases, onSelect, search, onSearch }: { releases: Release[]; onSelect: (id: number) => void; search: string; onSearch: (value: string) => void }) {
  const rows = releases.filter(r => `${r.releaseTitle} ${r.trackName} ${r.artistName} ${r.upcCode || ""}`.toLowerCase().includes(search.toLowerCase().trim()));
  return <section><label className={styles.search}>Find a release<input type="search" className="field" aria-label="Find delivery release" placeholder="Title, artist or UPC" value={search} onChange={e => onSearch(e.target.value)}/></label><p className={styles.count}>{rows.length} releases</p><div className={styles.grid}>{rows.map(r => <button key={r.id} className={styles.card} onClick={() => onSelect(r.id)} aria-label={`Open delivery details for ${r.releaseTitle || r.trackName}`} style={{ backgroundImage: r.artworkUrl ? `linear-gradient(0deg,rgba(3,6,12,.98),rgba(3,6,12,0) 80%),url("${artworkPreviewUrl(r.artworkUrl, 320).replace(/["\\]/g, "")}")` : undefined }}><span><strong>{r.releaseTitle || r.trackName}</strong><small>{r.artistName}</small></span></button>)}</div>{!rows.length && <p className={styles.count}>No matching releases.</p>}</section>;
}
export function ProducerStorefrontPreview({ producer, beats }: { producer: { id: number; name: string; profile?: { displayName?: string; bio?: string; portraitUrl?: string; avatarUrl?: string } }; beats: Beat[] }) {
  const published = beats.filter(b => b.producerId === producer.id && b.enabled && b.status === "PUBLISHED");
  return <section className={styles.preview}><header><h3>{producer.profile?.displayName || producer.name}</h3><p>{producer.profile?.bio || "Producer storefront preview"}</p><small>{published.length} published beats</small></header><div className={styles.beats}>{published.map(b => <article key={b.id}>{b.artworkUrl ? <img src={b.artworkUrl} alt=""/> : <div className={styles.noArt}>♪</div>}<div><strong>{b.title}</strong><p>{b.keySignature || "Key not set"} · {b.bpm || "—"} BPM</p><small>{b.mood || "Mood not set"} · {b.genre || "Genre not set"}</small></div></article>)}</div>{!published.length && <p>No beats are currently published on this storefront.</p>}</section>;
}
