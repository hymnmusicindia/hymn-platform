const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise the actual route with isolated sessions, database and storage.
let user = null;
let admin = null;
let status = "LIVE";
let archivedAt = null;
let featured = true;
let reads = 0;
const bytes = new Uint8Array([255, 216, 255, 217]);
const mocks = {
  "next/server": { NextResponse: Response },
  "@/lib/session": { getSession: async () => user, getAdminSession: async () => admin },
  "@/lib/prisma": { prisma: {
    release: { findUnique: async () => ({ id: 42, userId: 7, ownerUserId: 7, artworkUrl: "/api/assets/9/download", status, archivedAt }) },
    user: { findUnique: async () => ({ role: "CUSTOMER", status: "ACTIVE" }) },
    storedAsset: { findFirst: async () => ({ id: 9, releaseId: 42, ownerUserId: 7 }) }
  } },
  "@/lib/private-storage": { localPrivateStorage: { createAuthorizedRead: async (input) => {
    reads++;
    assert.equal(input.assetId, 9);
    assert.ok(input.isAdmin || input.requesterUserId === 7);
    return { bytes, mimeType: "image/jpeg" };
  } } },
  "@/lib/media-placeholder": { missingImageSvg: () => "placeholder", missingImageResponseHeaders: () => ({ "Cache-Control": "no-store" }) },
  "@/lib/release-media": { storedAssetIdFromUrl: () => 9 },
  "@/lib/db": { getSiteSettings: async () => ({ homeFeaturedReleaseIds: featured ? [42] : [99] }) }
};
const source = fs.readFileSync(path.join(__dirname, "../app/api/releases/[id]/artwork/route.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const sandbox = { exports: {}, require: (name) => {
  assert.ok(name in mocks, `Unexpected dependency: ${name}`);
  return mocks[name];
}, Uint8Array, console };
vm.runInNewContext(compiled, sandbox);
const request = () => sandbox.exports.GET(new Request("https://hymn.local/api/releases/42/artwork"), { params: Promise.resolve({ id: "42" }) });

async function expectArtwork() {
  const response = await request();
  assert.equal(response.headers.get("Content-Type"), "image/jpeg");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
}
async function expectDenied() {
  const before = reads;
  const response = await request();
  assert.equal(await response.text(), "placeholder");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(reads, before, "Denied requests must not read private storage");
}
async function main() {
  // Exercise homepage selection with and without manually featured IDs.
  let selectedIds = [];
  const releases = ["draft", "submitted", "scheduled", "sent", "sent_to_distributor", "distributor_processing", "awaiting_live_confirmation", "delivered", "partially_live", "live", "takedown", "archived"].map((status, index) => ({ id: index + 1, status, artworkUrl: "/cover.jpg" }));
  releases.push({ id: 34, status: "scheduled", artworkUrl: "/cover.jpg" });
  releases.push({ id: 35, status: "live", artworkUrl: "" });
  const homeMocks = {
    "next/cache": { unstable_cache: (fn) => fn },
    "@/lib/db": {
      listAllBeats: async () => [], listProducerProfiles: async () => [], listRecentGoogleAvatarUrls: async () => [],
      getSiteSettings: async () => ({ homeFeaturedReleaseIds: selectedIds }),
      listAllReleases: async () => releases
    },
    "@/lib/prisma": { prisma: { purchaseReview: { findMany: async () => [] } } }
  };
  const homeSource = fs.readFileSync(path.join(__dirname, "../lib/public-home-data.ts"), "utf8");
  const homeSandbox = { exports: {}, require: (name) => {
    assert.ok(name in homeMocks, `Unexpected homepage dependency: ${name}`);
    return homeMocks[name];
  } };
  vm.runInNewContext(ts.transpileModule(homeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, homeSandbox);
  for (const selection of [[], releases.map((release) => release.id), [1, 3, 34]]) {
    selectedIds = selection;
    const result = await homeSandbox.exports.getPublicHomePreview();
    assert.deepEqual(Array.from(result.featuredReleases, (release) => release.id), selection.length === 3 ? [] : [10]);
  }
  await expectArtwork(); // Anonymous homepage visitor.
  user = { sub: 88 };
  await expectArtwork(); // Signed-in visitor who does not own the release.
  user = null;
  for (const privateStatus of ["DRAFT", "SUBMITTED", "SCHEDULED", "SENT", "SENT_TO_DISTRIBUTOR", "DISTRIBUTOR_PROCESSING", "AWAITING_LIVE_CONFIRMATION", "DELIVERED", "PARTIALLY_LIVE", "TAKEDOWN", "ARCHIVED"]) {
    status = privateStatus;
    await expectDenied(); // Stale homepage cache must not expose private covers.
  }
  status = "LIVE";
  archivedAt = new Date();
  await expectDenied();
  archivedAt = null;
  featured = false;
  await expectDenied();
  user = { sub: 88 };
  await expectDenied();
  status = "DRAFT";
  user = { sub: 7 };
  await expectArtwork(); // Owner retains access to drafts.
  user = null;
  admin = { role: "admin" };
  await expectArtwork();
  console.log("Homepage artwork access checks passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
