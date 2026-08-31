import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beatAssetRelativePath, createSafeAssetFolderName, uploadConfig } from "../lib/storage-service";
import { normalizePublicUploadUrl, publicStorageRootPath, resolvePublicUploadPaths } from "../lib/storage";
import { CANONICAL_HOSTINGER_PUBLIC_STORAGE_ROOT } from "../lib/hostinger-storage";
import { canonicalReleaseArtworkUrl, storedAssetIdFromUrl } from "../lib/release-media";

const safe = createSafeAssetFolderName(" My Song / Final ❤️ ", "rel_123");
assert(safe.endsWith("rel_123"));
assert(!safe.includes("/") && !safe.includes("\\") && !safe.includes("..") && !safe.includes("\0"));
assert.notEqual(createSafeAssetFolderName("TEST", "rel_1"), createSafeAssetFolderName("TEST", "rel_2"));
const beatMaster = beatAssetRelativePath({ producerName: "Aditya / Producer", producerId: 7, beatTitle: "Night: Drive", beatId: 42, assetName: "Master Audio", originalFilename: "final.wav", mimeType: "audio/wav" });
assert.equal(beatMaster, "Beatstore/Aditya - Producer - producer_7/Night - Drive - beat_42/Master Audio/master.wav");
assert(!beatMaster.includes("..") && !beatMaster.includes("\\"));
assert.equal(normalizePublicUploadUrl("/home/account/hymn-storage/Public/Beatstore/Producer/Beat/Cover Art/cover.png"), "/api/public-uploads/Beatstore/Producer/Beat/Cover%20Art/cover.png");
assert.equal(canonicalReleaseArtworkUrl(20, "/api/assets/51/download?filename=cover.jpg"), "/api/releases/20/artwork");
assert.equal(canonicalReleaseArtworkUrl(20, "/api/public-uploads/releases/cover.jpg"), "/api/public-uploads/releases/cover.jpg");
assert.equal(canonicalReleaseArtworkUrl(20, "https://cdn.example.test/cover.jpg"), "https://cdn.example.test/cover.jpg");
assert.equal(storedAssetIdFromUrl("/api/assets/51/download?filename=cover.jpg"), 51);
assert.equal(storedAssetIdFromUrl("https://example.com/cover.jpg"), null);
assert.equal(publicStorageRootPath({ NODE_ENV: "production", STORAGE_ROOT: "./public/uploads" }), CANONICAL_HOSTINGER_PUBLIC_STORAGE_ROOT, "Production ignores disposable relative paths.");
assert.equal(publicStorageRootPath({ NODE_ENV: "production", STORAGE_ROOT: "D:\\hymn-storage\\Public" }), CANONICAL_HOSTINGER_PUBLIC_STORAGE_ROOT);
assert.equal(publicStorageRootPath({ NODE_ENV: "production", STORAGE_ROOT: "/srv/hymn-storage/Public" }), CANONICAL_HOSTINGER_PUBLIC_STORAGE_ROOT);
assert.equal(publicStorageRootPath({ NODE_ENV: "production", HYMN_STORAGE_ROOT: "/home/account/hymn-storage" }), CANONICAL_HOSTINGER_PUBLIC_STORAGE_ROOT);
assert.deepEqual(resolvePublicUploadPaths("producers/avatars/example.jpg", { NODE_ENV: "production", STORAGE_ROOT: "/home/account/public-media", HYMN_STORAGE_ROOT: "/home/account/current", PRIVATE_STORAGE_ROOT: "/home/account/legacy", HYMN_LEGACY_STORAGE_ROOTS: "/home/account/old-one;/home/account/old-two" }, "/app"), [
  "/home/u390865851/private-storage/Public/producers/avatars/example.jpg",
  "/home/account/public-media/producers/avatars/example.jpg",
  "/home/account/current/Public/producers/avatars/example.jpg",
  "/home/account/legacy/Public/producers/avatars/example.jpg",
  "/home/account/old-one/producers/avatars/example.jpg",
  "/home/account/old-one/Public/producers/avatars/example.jpg",
  "/home/account/old-two/producers/avatars/example.jpg",
  "/home/account/old-two/Public/producers/avatars/example.jpg",
  path.resolve("/app", "public/uploads/producers/avatars/example.jpg")
]);
for (const malicious of ["../../test.wav", "..\\..\\test.wav", "/test.wav", "C:\\test.wav", "%2e%2e/test.wav"]) {
  const result = createSafeAssetFolderName(decodeURIComponent(malicious), "trk_1");
  assert(!result.includes("/") && !result.includes("\\") && !result.includes(".."));
}
assert(uploadConfig.chunkSize >= 5 * 1024 * 1024 && uploadConfig.chunkSize <= 10 * 1024 * 1024);
assert(uploadConfig.maxConcurrency >= 1 && uploadConfig.maxConcurrency <= 4);
const completeRoute = readFileSync("app/api/uploads/sessions/[id]/complete/route.ts", "utf8");
assert(!completeRoute.includes("Buffer.concat"));
assert(completeRoute.includes("localStorageProvider.assemble"));
const chunkRoute = readFileSync("app/api/uploads/sessions/[id]/chunks/[index]/route.ts", "utf8");
assert(chunkRoute.includes("userId: auth.user.id"));
const beatUploadRoute = readFileSync("app/api/producer/beats/route.ts", "utf8");
assert(beatUploadRoute.includes("attachBeatAssets") && beatUploadRoute.includes("beatId: beatDraft.id"), "Beat assets must attach to a stable database draft rather than a placeholder record.");
assert(beatUploadRoute.includes("deleteUploadedFileByUrl") && beatUploadRoute.includes("deleteBeat(createdBeatId)"), "Failed beat uploads must clean up public assets and the incomplete draft.");
const releaseArtworkRoute = readFileSync("app/api/releases/[id]/artwork/route.ts", "utf8");
assert(releaseArtworkRoute.includes('assetType: "private_unreleased_artwork"') && releaseArtworkRoute.includes("linkedAsset"), "Release artwork must prefer the exact private cover art asset before legacy image fallbacks.");
assert(releaseArtworkRoute.includes('"X-HYMN-Release-Asset": "unauthorized"') && releaseArtworkRoute.includes("releaseAsset.releaseId === releaseId"), "Release artwork image requests must return an image fallback and allow authorized release-linked assets.");
const beatArtworkRoute = readFileSync("app/api/producer/beats/[id]/artwork/route.ts", "utf8");
assert(beatArtworkRoute.includes("deleteUploadedFileByUrlPermanently") && beatArtworkRoute.includes("current.artworkUploadId"), "Artwork replacement must permanently delete the previous file and obsolete upload record.");
assert(beatArtworkRoute.includes("databaseCommitted") && beatArtworkRoute.includes("No changes were kept"), "Artwork replacement must compensate safely when old-file deletion fails.");
const beatCard = readFileSync("components/beat-card.tsx", "utf8");
const beatStore = readFileSync("components/beat-store-experience.tsx", "utf8");
assert(beatCard.includes('loading="lazy"') && beatCard.includes("setCoverFailed(true)"), "Beat covers must use the original URL with a visible failure fallback.");
assert(beatCard.includes('h-16 w-16') && beatCard.includes("Pause") && beatCard.includes("Play"), "Beat artwork must expose a large central play/pause control.");
assert(beatCard.includes("controlsVisible || active") && beatCard.includes("onPointerEnter") && beatCard.includes("onPointerLeave"), "Playback controls must appear only on hover, touch reveal, focus, or active playback.");
assert(!beatCard.includes("Available") && !beatCard.includes("beatStoreSlug"), "Beat cards must remain compact and must not navigate to a redundant detail page.");
assert(beatCard.includes("Key {beat.keySignature}") && beatCard.includes("{beat.bpm} BPM"), "Mood, key, and BPM must share one compact metadata row.");
assert(!existsSync("app/(public)/beat-store/beats/[slug]/page.tsx"), "The redundant standalone beat-detail page must remain removed.");
assert(beatStore.includes('grid grid-cols-1 gap-4 sm:grid-cols-2'), "Phone layouts must render full-width beat cards.");
assert(beatStore.includes("replaceBrokenImage") && beatStore.includes("producer portrait"), "Producer portraits must retain the original source and recover from missing legacy media.");
console.log("Upload storage architecture checks passed.");
