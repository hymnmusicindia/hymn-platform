import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { startDireNoteBrowser } from "./direnote-browser-fixture";
import { submitRelease } from "../lib/distribution-service";

async function main() {
  assert.match(process.env.DATABASE_URL || "", /127\.0\.0\.1:55439\/direnote_virtual/);
  process.env.DIRENOTE_ARTIST_INFORMATION_ENDPOINT = "http://127.0.0.1:55440/check_artist";
  process.env.DIRENOTE_SONGWRITER_INFORMATION_ENDPOINT = "http://127.0.0.1:55440/check_songwriter";
  process.env.APP_URL = "https://hymnmusic.fun";
  const calls: Record<string, number> = {};
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const data = JSON.parse(raw); const action = request.url!.slice(1);
    calls[action] = (calls[action] || 0) + 1;
    assert.equal(data.pin, "fixture-pin"); assert.equal(data.client_id, "fixture-client");
    response.setHeader("Content-Type", "application/json");
    if (action === "check_artist") return response.end(JSON.stringify({ success: true, artist: { artist_id: data.artist_id, name: "Unconfirmed Fixture" } }));
    if (data.name === "Unconfirmed Fixture") { response.writeHead(503); return response.end(JSON.stringify({ success: false, error: "Provider unavailable" })); }
    if (data.name === "Conflict Fixture") { response.writeHead(409); return response.end(JSON.stringify({ success: false, error: "Profile already assigned" })); }
    if (data.search === "RATE_LIMIT_FIXTURE") { response.writeHead(429, { "retry-after": "120" }); return response.end(JSON.stringify({ success: false, error: "Rate limited" })); }
    const key = action.replace(/^list_/, "");
    response.end(JSON.stringify({ success: true, ...(action.startsWith("list_") ? { [key]: [{ name: "Fixture record" }], pagination: { page: data.page || 1, per_page: 25, total: 26, total_pages: 2, has_more: (data.page || 1) === 1 } } : { updated_fields: ["name"] }) }));
  });
  await new Promise<void>(resolve => server.listen(55440, "127.0.0.1", resolve));
  const user = await prisma.user.create({ data: { googleId: `v24-${randomUUID()}`, email: `v24-${randomUUID()}@example.test`, name: "V24 Fixture", role: "CUSTOMER", status: "ACTIVE" } });
  const browser = await startDireNoteBrowser(user.id);
  const origin = "http://127.0.0.1:55441";
  const admin = jwt.sign({ username: "admin", role: "admin" }, process.env.ADMIN_JWT_SECRET!, { expiresIn: "1h" });
  async function call(body: unknown, options: { cookie?: string; origin?: string } = {}) {
    const response = await fetch(`${origin}/api/admin/direnote/catalogue`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-proto": "https", Origin: options.origin ?? "https://hymnmusic.fun", Cookie: options.cookie ?? `hymn_admin_session=${admin}` }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  try {
    assert([401, 403].includes((await call({ action: "list_artists" }, { cookie: "" })).status));
    assert.equal((await call({ action: "list_artists" }, { origin: "https://evil.test" })).status, 403);
    assert.equal((await call({ action: "https://evil.test" })).status, 400);
    assert.equal((await call({ action: "list_artists", payload: { pin: "override" } })).status, 400);
    const list = await call({ action: "list_releases", payload: { page: 2 } }); assert.equal(list.status, 200); assert.equal(list.body.data.pagination.page, 2);
    const refs = ["territories", "stores", "genres", "languages", "instruments", "contributor_roles", "video_platforms", "master_collecting_bodies", "mechanical_societies", "performance_societies"];
    for (const key of refs) { const action = `list_${key}`; assert.equal((await call({ action })).status, 200); assert.equal((await call({ action })).status, 200); assert.equal(calls[action], 1); }
    for (const action of ["list_artists", "list_songwriters", "list_payouts", "get_smartlink", "check_qc_report"]) assert.equal((await call({ action, payload: action.startsWith("list_") ? {} : { upc: "3473620319345" } })).status, 200);
    const update = { action: "update_artist", payload: { artist_id: 6, name: "Updated Fixture" }, operationId: randomUUID(), confirmation: "CONFIRM UPDATE" };
    assert.equal((await call({ ...update, confirmation: "" })).status, 400);
    const oldAdmin = jwt.sign({ username: "admin", role: "admin", iat: Math.floor(Date.now() / 1000) - 3600 }, process.env.ADMIN_JWT_SECRET!, { expiresIn: "2h" });
    assert.equal((await call(update, { cookie: `hymn_admin_session=${oldAdmin}` })).status, 401);
    assert.equal((await call(update)).status, 200); assert.equal((await call(update)).body.replayed, true); assert.equal(calls.update_artist, 1);
    assert.equal((await call({ ...update, payload: { artist_id: 6, name: "Changed Payload" } })).status, 409); assert.equal(calls.update_artist, 1);
    assert.equal((await call({ ...update, operationId: randomUUID(), payload: { artist_id: 8, name: "Conflict Fixture" } })).status, 409);
    const uncertain = { ...update, operationId: randomUUID(), payload: { artist_id: 9, name: "Unconfirmed Fixture" } };
    const unconfirmed = await call(uncertain); assert.equal(unconfirmed.body.unconfirmed, true);
    const unfinished = await fetch(`${origin}/api/admin/direnote/catalogue`, { headers: { "x-forwarded-proto": "https", Cookie: `hymn_admin_session=${admin}` } });
    assert((await unfinished.json()).pending.some((row: { id: number }) => row.id === unconfirmed.body.auditId));
    const before = calls.update_artist;
    assert.equal((await call({ ...uncertain, operationId: randomUUID() })).status, 409); assert.equal(calls.update_artist, before);
    const reconciled = await fetch(`${origin}/api/admin/direnote/catalogue/reconcile`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-proto": "https", Origin: "https://hymnmusic.fun", Cookie: `hymn_admin_session=${admin}` }, body: JSON.stringify({ auditId: unconfirmed.body.auditId }) });
    assert.equal((await reconciled.json()).confirmed, true); assert.equal(calls.update_artist, before);
    assert.equal((await call({ action: "update_songwriter", payload: { songwriter_id: 4, ipi: "" }, operationId: randomUUID(), confirmation: "CONFIRM UPDATE" })).status, 200);
    const withdraw = { action: "withdraw_release", payload: { upc: "3473620319345" }, operationId: randomUUID(), confirmation: "WITHDRAW 3473620319345" };
    assert.equal((await call(withdraw)).status, 200); assert.equal((await call(withdraw)).body.replayed, true); assert.equal(calls.withdraw_release, 1);
    const withdrawnRelease = await prisma.release.create({ data: { userId: user.id, title: "Withdrawn fixture", artistName: "Fixture Artist", genre: "Pop", status: "APPROVED", paymentStatus: "paid", upc: "3473620319345", releaseDate: new Date("2099-01-01"), releaseType: "single" } });
    await assert.rejects(submitRelease(withdrawnRelease.id), /withdrawn from DireNote/);
    const limited = await call({ action: "list_stores", payload: { search: "RATE_LIMIT_FIXTURE" } }); assert.equal(limited.status, 429); assert.equal(limited.body.retryAfterSeconds, 120);
    const previousCalls = calls.list_artists;
    assert.equal((await call({ action: "list_artists" })).status, 429); assert.equal(calls.list_artists, previousCalls);
    await browser.page.context().clearCookies();
    await browser.page.context().addCookies([{ name: "hymn_admin_session", value: admin, url: origin }]);
    await browser.page.goto(`${origin}/admin/integrations/direnote`);
    await browser.page.getByRole("heading", { name: "DireNote catalogue & tools" }).waitFor({ state: "visible", timeout: 15000 }).catch(async error => { console.error("Admin UI diagnostics", browser.page.url(), await browser.page.locator("body").innerText()); throw error; });
    console.log("PASS v2.4 production HTTP: permissions/origin/recent-auth, all 19 tools, reference cache, pagination, audit/replay/conflict, ambiguous-write blocking, shared Retry-After and admin UI. Mock provider only.");
  } finally { await browser.stop(); await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exit(1); });
