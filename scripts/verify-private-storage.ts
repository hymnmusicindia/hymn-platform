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
assert.equal(validatePrivateUpload({ ownerUserId: 1, assetType: "private_unreleased_artwork", fileName: "cover.png", mimeType: "image/png", bytes: png }), "cover.png");

const releaseForm = readFileSync("components/release-form.tsx", "utf8");
const clientUploadRoute = readFileSync("app/api/assets/client-upload/route.ts", "utf8");
const privateStorage = readFileSync("lib/private-storage.ts", "utf8");
assert(releaseForm.includes("uploadPresigned") && releaseForm.includes("access: 'private'"), "Release files must use private presigned Blob uploads.");
assert(!releaseForm.includes("access: 'public'"), "Release files must never be uploaded to public Blob storage.");
assert(clientUploadRoute.includes("handleUploadPresigned") && clientUploadRoute.includes("issueSignedToken"), "Client upload authorization must support Vercel OIDC.");
assert(privateStorage.includes("get(asset.objectKey, { access: \"private\"") && privateStorage.includes("Range: input.range"), "Private Blob downloads must use authenticated, range-aware SDK reads.");
console.log("Private storage validation passed.");
// vercel trigger 9
