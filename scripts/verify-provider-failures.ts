import assert from "node:assert/strict";
import { submitToDireNote, getDireNoteReleaseInformation, getDireNoteRevenueReport } from "../lib/direnote/direnote-client";

process.env.DIRENOTE_CLIENT_ID = "fixture-client";
process.env.DIRENOTE_API_PIN = "fixture-secret";

async function main() {
  const calls = [
    (fetchImpl: typeof fetch) => submitToDireNote({}, { fetchImpl, timeoutMs: 20 }),
    (fetchImpl: typeof fetch) => getDireNoteReleaseInformation("123456789012", { fetchImpl, timeoutMs: 20 }),
    (fetchImpl: typeof fetch) => getDireNoteRevenueReport("INTST2600001", { fetchImpl, timeoutMs: 20 })
  ];
  for (const call of calls) {
    for (const status of [200, 201, 202, 204, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504]) {
      const result = await call(async () => new Response(status === 204 ? null : JSON.stringify({ success: true }), { status }));
      assert.equal(result.success, [200, 201, 202].includes(status), `HTTP ${status}`);
    }
    for (const body of ["{}", "[]", "null", '"ok"', '{"success":"true"}', '{"message":"OK"}', '{"success":false}', "", "<html>Bad gateway</html>", "{"]) {
      const result = await call(async () => new Response(body, { status: 200 }));
      assert.equal(result.success, false, `No false acceptance for ${body}`);
    }
    for (const failure of ["DNS failure", "connection reset"]) {
      const result = await call(async () => { throw new Error(failure); });
      assert.equal(result.success, false);
      assert.equal(result.httpStatus, null);
    }
    const timeout = await call(async () => new Promise(() => {}));
    assert.equal(timeout.success, false);
    assert.match(timeout.error!, /timed out/);
    const limited = await call(async () => new Response('{"error":"fixture-secret"}', { status: 429, headers: { "Retry-After": "120" } }));
    assert.equal(limited.retryAfterSeconds, 120);
    assert(!limited.error?.includes("fixture-secret"));
  }
  console.log("Provider HTTP, malformed-response, network, timeout and rate-limit matrix passed for all three endpoints.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
