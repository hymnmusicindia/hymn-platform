import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beatAssetRelativePath, createSafeAssetFolderName, uploadConfig } from "../lib/storage-service";

const safe = createSafeAssetFolderName(" My Song / Final ❤️ ", "rel_123");
assert(safe.endsWith("rel_123"));
assert(!safe.includes("/") && !safe.includes("\\") && !safe.includes("..") && !safe.includes("\0"));
assert.notEqual(createSafeAssetFolderName("TEST", "rel_1"), createSafeAssetFolderName("TEST", "rel_2"));
const beatMaster = beatAssetRelativePath({ producerName: "Aditya / Producer", producerId: 7, beatTitle: "Night: Drive", beatId: 42, assetName: "Master Audio", originalFilename: "final.wav", mimeType: "audio/wav" });
assert.equal(beatMaster, "Beatstore/Aditya - Producer - producer_7/Night - Drive - beat_42/Master Audio/master.wav");
assert(!beatMaster.includes("..") && !beatMaster.includes("\\"));
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
console.log("Upload storage architecture checks passed.");
