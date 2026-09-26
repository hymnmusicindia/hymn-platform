import Link from "next/link";
import { Download, FileAudio, Music2, Upload } from "lucide-react";
import { getCurrentUserForPage } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export default async function AudioLibraryPage() {
  const user = await getCurrentUserForPage();
  if (!user) return null;
  const assets = await (prisma.storedAsset.findMany({
    where: { ownerUserId: user.id, assetType: "private_audio_master", uploadStatus: "ready", deletedAt: null },
    select: { id: true, originalFilename: true, safeFilename: true, mimeType: true, byteSize: true, checksum: true, createdAt: true, releaseAssetLinks: { select: { release: { select: { id: true, title: true, status: true } }, track: { select: { title: true, trackNumber: true } } }, orderBy: { createdAt: "desc" }, take: 3 } },
    orderBy: { createdAt: "desc" }
  })) as any[];
  const formatBytes = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return <main className="shell py-8 sm:py-12"><div className="mx-auto max-w-5xl">
    <section className="surface-card p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="hymn-kicker">HYMN AUDIO LIBRARY</p><h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Your original masters</h1><p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>Every completed master stays in its original quality. Reuse a file for a new release and we’ll bring forward metadata from its previous live release.</p></div><Link href="/distribution/start" className="btn-primary pressable"><Upload className="h-4 w-4"/>Add to a release</Link></div></section>
    <section className="mt-6 grid gap-3">{assets.map((asset) => <article key={asset.id} className="surface-card flex flex-wrap items-center gap-4 p-4 sm:p-5"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><FileAudio className="h-5 w-5"/></span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{asset.originalFilename}</p><p className="mt-1 text-xs" style={{ color: "var(--text-soft)" }}>{asset.mimeType} · {formatBytes(asset.byteSize)} · stored {asset.createdAt.toLocaleDateString("en-IN")}</p><p className="mt-1 truncate text-xs" style={{ color: "var(--text-soft)" }}>Original checksum: {asset.checksum.slice(0, 16)}…</p>{asset.releaseAssetLinks[0] ? <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>Previously used in {asset.releaseAssetLinks[0].release.title}{asset.releaseAssetLinks[0].track ? ` · Track ${asset.releaseAssetLinks[0].track.trackNumber ?? ""} ${asset.releaseAssetLinks[0].track.title}` : ""}</p> : null}</div><div className="flex shrink-0 gap-2"><a className="btn-outline pressable px-3 py-2" href={`/api/assets/${asset.id}/download?filename=${encodeURIComponent(asset.safeFilename)}`}><Download className="h-4 w-4"/>Download</a><Link className="btn-primary pressable px-3 py-2" href={`/distribution/start?audioAssetId=${asset.id}`}><Music2 className="h-4 w-4"/>Use file</Link></div></article>)}{assets.length === 0 ? <section className="surface-card p-8 text-center"><FileAudio className="mx-auto h-10 w-10" style={{ color: "var(--text-soft)" }}/><h2 className="mt-4 text-xl font-semibold">Your library is empty</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Upload a master in a release and it will remain available here in original quality.</p></section> : null}</section>
  </div></main>;
}
