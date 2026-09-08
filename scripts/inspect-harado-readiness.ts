import { readFile } from "node:fs/promises";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";

async function main() {
  const config = parse(await readFile(process.argv[2]));
  Object.assign(process.env, config);
  process.env.NODE_ENV = "production";
  const { getDireNoteConfig } = await import("../lib/direnote/direnote-config");
  const provider = getDireNoteConfig();
  console.log(JSON.stringify({ officialEndpoints: {
    ingest: provider.endpoint === "https://api.direnotemedia.com/ingest_content",
    status: provider.releaseInformationEndpoint === "https://api.direnotemedia.com/check_release_status",
    revenue: provider.revenueReportEndpoint === "https://api.direnotemedia.com/check_revenue_report"
  } }));
  const db = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
  const artwork = (value: unknown) => {
    try { const url = new URL(String(value), "https://hymn.local"); return { kind: url.pathname.startsWith("/api/") ? "api-route" : "file", extension: url.pathname.match(/\.[a-z0-9]+$/i)?.[0] ?? null }; } catch { return null; }
  };
  try {
    const releases = await db.release.findMany({ where: { title: { equals: "HARADO TEST", mode: "insensitive" } }, select: { id: true, title: true, releaseType: true, status: true, artworkUrl: true, metadata: true, tracks: { select: { id: true, title: true, trackNumber: true, metadata: true } } } });
    for (const release of releases) {
      const meta = release.metadata as Record<string, any> | null;
      const assets = await db.storedAsset.findMany({ where: { releaseId: release.id, assetType: "private_unreleased_artwork", deletedAt: null }, select: { id: true, mimeType: true, safeFilename: true, uploadStatus: true } });
      console.log(JSON.stringify({ id: release.id, title: release.title, type: release.releaseType, status: release.status, artwork: artwork(release.artworkUrl), language: meta?.language, contentType: meta?.contentType ?? meta?.contenttype, ownershipConfirmed: meta?.ownershipConfirmed, mood: meta?.mood, legacyTrackCount: Array.isArray(meta?.tracks) ? meta.tracks.length : null, tracks: release.tracks.map(track => { const m = track.metadata as Record<string, any> | null; return { id: track.id, number: track.trackNumber, language: m?.language, legacyLanguage: m?.titleLanguage ?? m?.metadata?.titleLanguage, version: m?.version }; }), assets: assets.map(asset => ({ id: asset.id, mimeType: asset.mimeType, extension: asset.safeFilename.match(/\.[a-z0-9]+$/i)?.[0], status: asset.uploadStatus })) }));
      const { getDetailedReleaseById } = await import("../lib/distribution-db");
      const { validateReleaseForDireNote } = await import("../lib/direnote-readiness");
      const detailed = await getDetailedReleaseById(release.id);
      if (detailed) {
        const result = await validateReleaseForDireNote(detailed);
        console.log(JSON.stringify({ releaseId: release.id, payloadTrackCount: result.payload.tracks.length, artwork: artwork(result.payload.cover_art_url), ready: result.ready, issues: result.issues }));
      }
    }
  } finally { await db.$disconnect(); const { prisma } = await import("../lib/prisma"); await prisma.$disconnect(); }
}
main().catch(() => { console.error("Read-only HARADO inspection failed; no credentials or asset URLs printed."); process.exitCode = 1; });
