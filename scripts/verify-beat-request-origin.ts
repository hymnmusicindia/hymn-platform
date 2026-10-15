import assert from "node:assert/strict";
import { isSameAppOrigin } from "../lib/request-origin";

const original = { ...process.env };
try {
  Object.assign(process.env, { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://hymnmusic.fun" });
  const request = (origin?: string) => new Request("http://127.0.0.1:3000/api/beats/1/free-download", { method: "POST", headers: origin ? { origin } : {} });
  assert.equal(isSameAppOrigin(request("https://hymnmusic.fun")), true, "Public HTTPS origin must work behind internal HTTP proxy");
  assert.equal(isSameAppOrigin(request("https://evil.example")), false);
  assert.equal(isSameAppOrigin(request("https://hymnmusic.fun.evil.example")), false);
  assert.equal(isSameAppOrigin(request("http://hymnmusic.fun")), false);
  assert.equal(isSameAppOrigin(request("null")), false);
  assert.equal(isSameAppOrigin(request()), false);
  assert.equal(isSameAppOrigin(request("https://hymnmusic.fun/path")), false);
  Object.assign(process.env, { NODE_ENV: "development", NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
  assert.equal(isSameAppOrigin(request("http://localhost:3000")), true);
  console.log("PASS: public reverse-proxy origin, local origin, and cross-origin/missing/malformed-origin rejection.");
} finally { process.env = original; }
