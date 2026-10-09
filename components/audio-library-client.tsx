"use client";

import Link from "next/link";
import { Download, MoreHorizontal, Music2, Search, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AudioWaveform } from "@/components/audio-waveform";

type LibraryAsset = { id: number; originalFilename: string; safeFilename: string; audioUrl: string; mimeType: string; byteSize: number; createdAt: string; released: boolean; coverArtUrl: string | null };

export function AudioLibraryClient({ assets }: { assets: LibraryAsset[] }) {
  const [query, setQuery] = useState("");
  const [menuId, setMenuId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const filtered = assets.filter(asset => asset.originalFilename.toLowerCase().includes(query.trim().toLowerCase()));
  const formatDate = (value: string) => new Date(value).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });

  useEffect(() => {
    if (menuId === null) return;
    function dismiss(event: MouseEvent) { if (!menuRef.current?.contains(event.target as Node)) setMenuId(null); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setMenuId(null); }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", dismiss); document.removeEventListener("keydown", escape); };
  }, [menuId]);

  return <main className="master-library">
    <header className="master-library-heading"><div><p>HYMN AUDIO LIBRARY</p><h1>Your original masters</h1></div><Link href="/distribution/start" className="btn-primary"><Upload size={16}/> Add a master</Link></header>
    <div className="master-library-toolbar"><span>All files</span><label className="master-library-search"><Search size={16}/><input aria-label="Search audio library" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search by name"/></label><span className="master-library-count">{filtered.length} {filtered.length===1?"file":"files"}</span></div>
    <div className="master-library-list"><div className="master-library-columns"><span>Name</span><span>Preview</span><span>Modified</span><span/></div>
      {filtered.map(asset=><article key={asset.id} className="master-library-row">
        <div className="master-library-file"><span className="master-library-icon">{asset.coverArtUrl?<img src={asset.coverArtUrl} alt="" loading="lazy"/>:<Music2 size={17}/>}</span><div><h2 title={asset.originalFilename}>{asset.originalFilename}</h2><p>Original{asset.released?<span className="master-library-released">Released</span>:null}</p></div></div>
        <div className="master-library-preview"><AudioWaveform src={asset.audioUrl} title={asset.originalFilename} compact compactMinimal/></div>
        <time className="master-library-date" dateTime={asset.createdAt}>{formatDate(asset.createdAt)}</time>
        <div className="master-library-actions" ref={menuId===asset.id?menuRef:undefined}><button type="button" aria-label={`Actions for ${asset.originalFilename}`} aria-expanded={menuId===asset.id} aria-controls={`master-actions-${asset.id}`} onClick={()=>setMenuId(menuId===asset.id?null:asset.id)}><MoreHorizontal size={18}/></button>{menuId===asset.id?<div id={`master-actions-${asset.id}`} className="master-library-menu"><a href={`/api/assets/${asset.id}/download?filename=${encodeURIComponent(asset.safeFilename)}&download=1`} onClick={()=>setMenuId(null)}><Download size={15}/> Download</a><Link href={`/distribution/start?audioAssetId=${asset.id}`} onClick={()=>setMenuId(null)}><Music2 size={15}/> Use in release</Link></div>:null}</div>
      </article>)}
      {!filtered.length?<div className="master-library-empty"><Music2 size={28}/><p>{assets.length?"No files match your search.":"Upload a master in a release and it will appear here."}</p></div>:null}
    </div>
  </main>;
}
