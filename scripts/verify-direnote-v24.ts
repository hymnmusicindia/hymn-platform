import assert from "node:assert/strict";
import { direNoteV24Actions, direNoteV24Schemas, direNoteV24Request } from "../lib/direnote/v24-contract";
import { requestDireNoteV24 } from "../lib/direnote/v24-client";
import { confirmsDireNoteIdentityChange, confirmsDireNoteWithdrawal } from "../lib/direnote/v24-reconciliation";

process.env.DIRENOTE_API_PIN = "fixture-v24-pin";
process.env.DIRENOTE_CLIENT_ID = "fixture-v24-client";
process.env.DIRENOTE_INGEST_ENDPOINT = "https://api.direnotemedia.com/ingest_content";
async function main() {
  assert.equal(direNoteV24Actions.length, 19);
  for (const action of direNoteV24Actions) {
    const input = action === "update_artist" ? { artist_id: 1, spotify_url: "" } : action === "update_songwriter" ? { songwriter_id: 2, ipi: null } : ["get_smartlink", "check_qc_report", "withdraw_release"].includes(action) ? { upc: "3473 620-319345" } : {};
    let calls = 0;
    const response = await requestDireNoteV24(action, input, { fetchImpl: (async (url, init) => {
      calls++; assert.equal(String(url), `https://api.direnotemedia.com/${action}`);
      assert.equal(init?.method, "POST"); const body = JSON.parse(String(init?.body));
      assert.equal(body.pin, "fixture-v24-pin"); assert.equal(body.client_id, "fixture-v24-client");
      if ("upc" in input) assert.equal(body.upc, "3473620319345");
      if (action === "update_artist") { assert.equal(body.spotify_url, ""); assert.equal("name" in body, false); }
      return Response.json({ success: true });
    }) as typeof fetch });
    assert.equal(calls, 1); assert.equal(response.success, true);
  }
  assert.equal(direNoteV24Request.safeParse({ action: "https://evil.test", payload: {} }).success, false);
  assert.equal(direNoteV24Schemas.list_releases.safeParse({ pin: "injected" }).success, false);
  assert.equal(direNoteV24Schemas.list_releases.safeParse({ typeOfRelease: "Single" }).success, false);
  assert.equal(direNoteV24Schemas.list_releases.safeParse({ type_of_release: "Single" }).success, true);
  assert.equal(direNoteV24Schemas.list_artists.safeParse({ per_page: 101 }).success, false);
  assert.equal(direNoteV24Schemas.update_artist.safeParse({ artist_id: 1 }).success, false);
  assert.equal(direNoteV24Schemas.update_artist.safeParse({ artist_id: 1, instagram_url: "" }).success, false);
  assert.equal(direNoteV24Schemas.update_songwriter.safeParse({ songwriter_id: 1, name: "One" }).success, false);
  assert.equal(direNoteV24Schemas.update_songwriter.safeParse({ songwriter_id: 1, ipi: "123" }).success, false);
  assert.equal(direNoteV24Schemas.list_payouts.safeParse({ from_date: "2026-02-30" }).success, false);
  assert.equal(direNoteV24Schemas.list_payouts.safeParse({ from_date: "2026-10-20", to_date: "2026-10-10" }).success, false);
  const limited = await requestDireNoteV24("list_stores", {}, { fetchImpl: (async () => new Response("Slow down", { status: 429, headers: { "retry-after": "120" } })) as typeof fetch });
  assert.equal(limited.success, false); assert.equal(limited.retryAfterSeconds, 120);
  const conflict = await requestDireNoteV24("update_artist", { artist_id: 1, name: "New Name" }, { fetchImpl: (async () => Response.json({ success: false, error: { message: "Duplicate profile", code: 409 } }, { status: 409 })) as typeof fetch });
  assert.equal(conflict.success, false); assert.equal(conflict.httpStatus, 409);
  const timeout = await requestDireNoteV24("list_stores", {}, { timeoutMs: 10, fetchImpl: (() => new Promise(() => {})) as typeof fetch });
  assert.equal(timeout.success, false); assert.match(timeout.error!, /timed out/);
  assert.equal(confirmsDireNoteIdentityChange("update_artist", { artist_id: 1, spotify_url: "" }, { artist: { artist_id: 1, links: {} } }), false);
  assert.equal(confirmsDireNoteIdentityChange("update_artist", { artist_id: 1, spotify_url: "" }, { artist: { artist_id: 1, links: { spotify: null } } }), true);
  assert.equal(confirmsDireNoteIdentityChange("update_artist", { artist_id: 1, name: "Changed" }, { artist: { artist_id: 2, name: "Changed" } }), false);
  assert.equal(confirmsDireNoteWithdrawal({ upc: "3473620319345" }, { upc_code: "3473620319345", tracks: [{ status: "Rejected", remarks: "Metadata incorrect" }] }), false);
  assert.equal(confirmsDireNoteWithdrawal({ upc: "3473620319345" }, { upc_code: "3473620319345", tracks: [{ status: "Rejected", remarks: "Withdrawn by user" }] }), true);
  console.log("PASS DireNote v2.4: all 19 allowlisted operations, server credentials, normalization, patch semantics, validation, non-JSON Retry-After, conflict and timeout handling. No live requests.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
