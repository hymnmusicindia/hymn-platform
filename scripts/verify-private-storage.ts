import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readImageDimensions, validatePrivateUpload, type PrivateUploadInput } from "../lib/private-storage";

const base: PrivateUploadInput = { ownerUserId: 1, assetType: "private_cover_licence", fileName: "licence.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.7 safe fixture") };
assert.equal(validatePrivateUpload(base), "licence.pdf");
assert.throws(() => validatePrivateUpload({ ...base, fileName: "../licence.pdf" }), /filename/);
assert.throws(() => validatePrivateUpload({ ...base, fileName: "licence.exe.pdf" }), /filename/);
assert.throws(() => validatePrivateUpload({ ...base, mimeType: "application/x-msdownload" }), /MIME/);
assert.throws(() => validatePrivateUpload({ ...base, bytes: Buffer.from("not a PDF") }), /content/);
assert.throws(() => validatePrivateUpload({ ...base, bytes: Buffer.alloc(21 * 1024 * 1024) }), /size/);
const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt ")]);
assert.equal(validatePrivateUpload({ ownerUserId: 1, assetType: "private_audio_master", fileName: "master.wav", mimeType: "audio/wav", bytes: wav }), "master.wav");
assert.throws(() => validatePrivateUpload({ ownerUserId: 1, assetType: "private_audio_master", fileName: "fake.wav", mimeType: "audio/wav", bytes: Buffer.from("not audio") }), /content/);
const png = Buffer.alloc(24); Buffer.from("89504e470d0a1a0a", "hex").copy(png); png.writeUInt32BE(3000, 16); png.writeUInt32BE(3000, 20);
assert.deepEqual(readImageDimensions("image/png", png), { width: 3000, height: 3000 });
assert.throws(() => validatePrivateUpload({ ownerUserId: 1, assetType: "private_unreleased_artwork", fileName: "cover.png", mimeType: "image/png", bytes: png }), /MIME/);
const jpeg = Buffer.alloc(20); Buffer.from("ffd8ffc0000b08", "hex").copy(jpeg); jpeg.writeUInt16BE(3000, 7); jpeg.writeUInt16BE(3000, 9);
assert.deepEqual(readImageDimensions("image/jpeg", jpeg), { width: 3000, height: 3000 });
assert.equal(validatePrivateUpload({ ownerUserId: 1, assetType: "private_unreleased_artwork", fileName: "cover.jpg", mimeType: "image/jpeg", bytes: jpeg }), "cover.jpg");

const releaseForm = readFileSync("components/release-form.tsx", "utf8");
const clientUploadRoute = readFileSync("app/api/assets/client-upload/route.ts", "utf8");
const privateStorage = readFileSync("lib/private-storage.ts", "utf8");
const distributorDelivery = readFileSync("lib/distributor-asset-delivery.ts", "utf8");
const publicAppUrl = readFileSync("lib/public-app-url.ts", "utf8");
const assetDownloadRoute = readFileSync("app/api/assets/[id]/download/route.ts", "utf8");
assert(releaseForm.includes('request.open("POST", "/api/assets")') && releaseForm.includes('/api/uploads/sessions'), "Release files must use authenticated private Hostinger upload routes.");
assert(!releaseForm.includes("access: 'public'"), "Release files must never be uploaded to public Blob storage.");
assert(clientUploadRoute.includes("handleUploadPresigned") && clientUploadRoute.includes("issueSignedToken"), "Client upload authorization must support Vercel OIDC.");
assert(privateStorage.includes("get(asset.objectKey, { access: \"private\"") && privateStorage.includes("Range: input.range"), "Private Blob downloads must use authenticated, range-aware SDK reads.");
assert(distributorDelivery.includes("getPublicAppUrl(siteUrl)"), "Distributor delivery must use the canonical public URL resolver.");
assert(/const candidates = \[\s*process\.env\.NEXT_PUBLIC_APP_URL,[\s\S]*?requestUrl,/.test(publicAppUrl), "Configured public hostname must take precedence over Hostinger's internal request origin.");
assert(publicAppUrl.includes('"0.0.0.0"') && publicAppUrl.includes('hostname.endsWith(".local")'), "Internal origins must not be emitted as public production URLs.");
assert(assetDownloadRoute.includes("Promise.all([getSession(), getAdminSession()])"), "Asset downloads must honor admin authorization even when a customer cookie is also present.");
console.log("Private storage validation passed.");
// vercel trigger 9
