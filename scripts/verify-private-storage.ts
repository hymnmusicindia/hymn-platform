import assert from "node:assert/strict";
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
console.log("Private storage validation passed.");
// vercel trigger 9
