import assert from "node:assert/strict";
import sharp from "sharp";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CoverArt } from "../components/cover-art";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { artworkPreviewUrl, requestedArtworkWidth } from "../lib/artwork-preview";
import { artworkThumbnail } from "../lib/artwork-thumbnail";

async function main() {
  assert.equal(artworkPreviewUrl("/api/releases/25/artwork?filename=cover.jpg", 135), "/api/releases/25/artwork?filename=cover.jpg&w=192");
  assert.equal(artworkPreviewUrl("/api/assets/3/download?download=1", 192), "/api/assets/3/download?download=1");
  for (const src of ["blob:local", "data:image/png;base64,abc", "https://private.invalid/cover.jpg", "/api/distribution-assets/1/token/cover.jpg"]) assert.equal(artworkPreviewUrl(src, 192), src);
  assert.equal(artworkPreviewUrl("https://is1-ssl.mzstatic.com/image/thumb/Music/a/1200x1200bb.jpg", 192), "https://is1-ssl.mzstatic.com/image/thumb/Music/a/192x192bb.jpg");
  assert.equal(requestedArtworkWidth(new Request("https://hymn.local/?w=99999")), null);
  assert.equal(requestedArtworkWidth(new Request("https://hymn.local/?w=192")), 192);
  assert.equal(artworkPreviewUrl("/assets/playlist-images/previews/1.webp", 112), "/api/image-preview?src=%2Fassets%2Fplaylist-images%2Fpreviews%2F1.webp&w=192");
  const { GET: staticPreview } = await import("../app/api/image-preview/route");
  const staticImage = await staticPreview(new Request("https://hymn.local/api/image-preview?src=%2Fassets%2Fplaylist-images%2Fpreviews%2F1.webp&w=192"));
  assert.equal(staticImage.status, 200);
  assert.equal((await sharp(Buffer.from(await staticImage.arrayBuffer())).metadata()).width, 192);
  for (const src of ["https://evil.example/image.jpg", "/assets/../../.env.jpg", "/api/releases/1/artwork", "/assets/image.svg"]) {
    assert.equal((await staticPreview(new Request(`https://hymn.local/api/image-preview?src=${encodeURIComponent(src)}&w=192`))).status, 400);
  }
  const markup = renderToStaticMarkup(createElement(CoverArt, { src: "/api/releases/25/artwork?filename=cover.jpg", previewWidth: 192, alt: "Tere Bin cover", loading: "eager", width: 135, height: 135 }));
  assert.match(markup, /w=192/);
  assert.match(markup, /w=640.*2x/);
  assert.match(markup, /loading="eager"/);
  assert.match(markup, /decoding="async"/);
  const original = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: "#cc6633" } }).jpeg({ quality: 95 }).toBuffer();
  const backup = Buffer.from(original);
  const [small, same] = await Promise.all([artworkThumbnail(original, 192), artworkThumbnail(original, 192)]);
  assert.equal(small, same, "Concurrent requests share one render");
  assert.equal(await artworkThumbnail(original, 192), small, "Warm previews reuse cache");
  assert.deepEqual(original, backup, "Distributor/download original stays untouched");
  const metadata = await sharp(small).metadata();
  assert.equal(metadata.width, 192);
  assert.equal(metadata.format, "webp");
  assert.ok(small.length < original.length / 5);
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "hymn-artwork-preview-"));
  await mkdir(path.join(fixtureRoot, "site"));
  await writeFile(path.join(fixtureRoot, "site", "test.jpg"), original);
  const previousRoot = process.env.STORAGE_ROOT;
  process.env.STORAGE_ROOT = fixtureRoot;
  try {
    const { GET } = await import("../app/api/public-uploads/[...path]/route");
    for (const query of ["", "?w=192", "?w=99999"]) {
      const response = await GET(new NextRequest(`https://hymn.local/api/public-uploads/site/test.jpg${query}`), { params: Promise.resolve({ path: ["site", "test.jpg"] }) });
      const body = Buffer.from(await response.arrayBuffer());
      if (query === "?w=192") { assert.equal(response.headers.get("Content-Type"), "image/webp"); assert.equal((await sharp(body).metadata()).width, 192); }
      else assert.deepEqual(body, original, "Original/invalid-width requests remain original bytes");
    }
    const denied = await GET(new NextRequest("https://hymn.local/api/public-uploads/../secret.jpg?w=192"), { params: Promise.resolve({ path: ["..", "secret.jpg"] }) });
    assert.equal(denied.status, 400, "Thumbnail path cannot escape allowed public storage");
  } finally {
    if (previousRoot === undefined) delete process.env.STORAGE_ROOT;
    else process.env.STORAGE_ROOT = previousRoot;
  }
  if (process.argv.includes("--live")) {
    for (const id of [25, 34]) {
      const response = await fetch(`https://hymnmusic.fun/api/releases/${id}/artwork?filename=cover.jpg`);
      assert.equal(response.headers.get("content-type"), "image/jpeg");
      const bytes = Buffer.from(await response.arrayBuffer());
      const preview = await artworkThumbnail(bytes, 320);
      console.log(`Release ${id}: ${bytes.length} original bytes → ${preview.length} preview bytes (${Math.round((1 - preview.length / bytes.length) * 100)}% smaller)`);
    }
  }
  console.log("Artwork URL safety, dimensions, compression, original preservation and cache checks passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
