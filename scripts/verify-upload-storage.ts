import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSafeAssetFolderName, uploadConfig } from "../lib/storage-service";

const safe = createSafeAssetFolderName(" My Song / Final ❤️ ", "rel_123");
assert(safe.endsWith("rel_123"));
assert(!safe.includes("/") && !safe.includes("\\") && !safe.includes("..") && !safe.includes("\0"));
assert.notEqual(createSafeAssetFolderName("TEST", "rel_1"), createSafeAssetFolderName("TEST", "rel_2"));
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
console.log("Upload storage architecture checks passed.");
