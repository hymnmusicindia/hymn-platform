import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import jwt from "jsonwebtoken";

export async function startDireNoteBrowser(userId: number) {
  const origin = "http://127.0.0.1:55441";
  const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "55441", "-H", "127.0.0.1"], { env: { ...process.env, NODE_ENV: "production" }, stdio: "inherit", windowsHide: true });
  const stopped = new Promise<void>(resolve => app.on("exit", () => resolve()));
  const browser = await chromium.launch({ headless: true });
  try {
    let ready = false;
    for (let retry = 0; retry < 60; retry++) {
      try { const response = await fetch(`${origin}/api/cron/direnote-release-sync`, { headers: { "x-forwarded-proto": "https" }, redirect: "manual", signal: AbortSignal.timeout(3000) }); ready = response.status === 401; if (ready) break; } catch { /* Server still starting. */ }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error("Production server did not become ready.");
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { "x-forwarded-proto": "https" } });
    await context.route("https://cdn.example.test/cover.jpg", route => route.fulfill({ path: "public/assets/producers/placeholder-1.jpg", contentType: "image/jpeg" }));
    await context.addCookies([{ name: "hymn_session", value: jwt.sign({ sub: userId, email: "gxrry@example.test", name: "gxrry", role: "customer" }, process.env.JWT_SECRET!, { expiresIn: "1h" }), url: origin }]);
    const page = await context.newPage();
    return {
      page,
      async readinessIsolation(singleId: number, staleId: number) {
        const actual = await context.request.get(`${origin}/api/admin/releases/${singleId}/direnote/readiness`);
        expect(actual.status()).toBe(200);
        const data = await actual.json();
        expect(data.releaseId).toBe(singleId);
        expect(data.trackCount).toBe(1);
        expect(data.ready, JSON.stringify(data.issues)).toBe(true);
        expect(actual.headers()["cache-control"]).toContain("no-store");
        // The initial catalog selection is deliberately outside the review queue.
        const staleRoute = `**/api/admin/releases/${staleId}/direnote/readiness`;
        await page.route(staleRoute, async route => {
          const response = await route.fetch();
          await new Promise(resolve => setTimeout(resolve, 1500));
          await route.fulfill({ response }).catch(() => undefined);
        });
        await page.goto(`${origin}/admin?tab=releases&releaseId=${staleId}`);
        await page.getByRole("button", { name: /QC Queue/ }).first().click();
        await page.getByRole("navigation", { name: "Release review sections" }).getByRole("button", { name: "Distribution readiness", exact: true }).click();
        await expect(page.getByText(/^ready for direnote$/i)).toBeVisible();
        await page.waitForTimeout(2000);
        await expect(page.getByText(/^ready for direnote$/i)).toBeVisible();
        await expect(page.getByText(/Track 2 requires its own/)).toHaveCount(0);
        await expect(page.getByText(/Convert PNG/)).toHaveCount(0);
        await page.screenshot({ path: ".cache/harado-readiness-desktop.png", fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        const closeNavigation = page.getByRole("button", { name: "Close workspace navigation" });
        if (await closeNavigation.isVisible()) await closeNavigation.click();
        await expect(page.getByText(/^ready for direnote$/i)).toBeVisible();
        await page.screenshot({ path: ".cache/harado-readiness-mobile.png", fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.unroute(staleRoute);
      },
      async paidDraftCheckout(releaseId: number, fulfilled: boolean, expectedStatus = 200) {
        const response = await context.request.post(`${origin}/api/distribution/payment/create-order`, { data: { draftReleaseId: releaseId, plan: "one_time", paymentModel: "one_time", trackCount: 1, releaseType: "single", platforms: ["Spotify"] } });
        expect(response.status(), await response.text()).toBe(expectedStatus);
        if (expectedStatus !== 200) return;
        const body = await response.json();
        expect(body.requiresPayment).toBe(false);
        if (fulfilled) expect(body.paidReleaseReusable).toBe(true);
        else {
          expect(body.paidOrderReusable).toBe(true);
          expect(body.paymentId).toBe("pay_fixture_paid_draft");
        }
      },
      async correction(releaseId: number) {
        await page.goto(`${origin}/dashboard/releases/${releaseId}?tab=corrections`);
        await expect(page.getByRole("heading", { name: "Action Required", exact: true })).toBeVisible();
        await expect(page.getByText("DireNote review: TRACK 2 SEEMS LIKE AN INSTRUMENTAL. PLEASE SELECT RELEVANT TRACK LANGUAGE", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Fix Track 2", exact: true })).toBeVisible();
        await expect(page.getByText("3473620313503", { exact: true }).first()).toBeVisible();
        await page.screenshot({ path: ".cache/direnote-correction-desktop.png", fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.getByRole("button", { name: "Fix Track 2", exact: true })).toBeVisible();
        await page.screenshot({ path: ".cache/direnote-correction-mobile.png", fullPage: true });
        const overflow = await page.evaluate(() => [...document.querySelectorAll("body *")].map(element => ({ tag: element.tagName, className: element.className, width: element.getBoundingClientRect().width, right: element.getBoundingClientRect().right })).filter(element => element.width > window.innerWidth || element.right > window.innerWidth + 2).slice(0, 12));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth), JSON.stringify(overflow)).toBe(true);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.getByRole("button", { name: "Fix Track 2", exact: true }).click();
        await expect(page).toHaveURL(/correctionField=tracks\.1\./);
      },
      async editLanguage(releaseId: number) {
        const panel = page.locator('[data-track-index="1"]');
        await expect(panel).toBeVisible();
        await expect(panel.getByText("Lyrics (optional)", { exact: true })).toBeVisible();
        await expect(panel.getByRole("textbox", { name: "Track 2 lyrics" })).not.toHaveAttribute("required");
        await panel.getByRole("button", { name: "Original", exact: true }).click();
        await page.getByRole("button", { name: "Instrumental", exact: true }).last().click();
        await expect(panel.getByText("Track Language", { exact: true })).toHaveCount(0);
        await expect(panel.getByRole("button", { name: "Hindi", exact: true })).toHaveCount(0);
        await page.getByRole("button", { name: /Release info/ }).first().click();
        await page.getByRole("button", { name: "Hindi", exact: true }).click();
        await page.getByRole("dialog", { name: "Choose language" }).getByRole("button", { name: "Tamil", exact: true }).click();
        await expect(page.locator('button[aria-busy="true"]')).toHaveCount(0);
        await page.getByRole("button", { name: /Delivery/ }).first().click();
        await page.screenshot({ path: ".cache/direnote-delivery-before-ownership.png", fullPage: true });
        await page.getByRole("button", { name: "Original/Exclusive Licensed", exact: true }).click();
        await page.getByRole("dialog", { name: "Choose content ownership" }).getByRole("button", { name: "AI Generated", exact: true }).click();
        await expect(page.getByText("Suno receipt PDF", { exact: true })).toBeVisible();
        await page.getByRole("button", { name: "AI Generated", exact: true }).click();
        await page.getByRole("dialog", { name: "Choose content ownership" }).getByRole("button", { name: "Original/Exclusive Licensed", exact: true }).click();
        await expect(page.locator('button[aria-busy="true"]')).toHaveCount(0);
        await page.getByRole("button", { name: "Review", exact: true }).click();
        await page.screenshot({ path: ".cache/direnote-form-before-save.png", fullPage: true });
        const save = page.getByRole("button", { name: /Submit corrections/ });
        await expect(save).toBeEnabled();
        const response = page.waitForResponse(value => value.url().endsWith("/api/distribution/update-release"));
        await save.click();
        const saved = await response;
        expect(saved.status(), await saved.text()).toBe(200);
        await page.goto(`${origin}/distribution/start?edit=${releaseId}&correctionField=tracks.1.trackLanguage`);
        await expect(page.locator('[data-track-index="1"]').getByRole("button", { name: "Instrumental", exact: true })).toHaveCount(1);
        await expect(page.locator('[data-track-index="1"]').getByText("Track Language", { exact: true })).toHaveCount(0);
        await expect(page.locator('[data-track-index="1"] .release-track-selected-artist')).toHaveCount(1);
        await page.screenshot({ path: ".cache/direnote-language-reloaded.png", fullPage: true });
      },
      async submit(releaseId: number) {
        await page.goto(`${origin}/dashboard/releases/${releaseId}?tab=corrections`);
        const button = page.getByRole("button", { name: "Submit Corrections", exact: true });
        await expect(button).toBeEnabled();
        const response = page.waitForResponse(value => value.url().endsWith(`/api/releases/${releaseId}/resubmit`));
        await button.click();
        expect((await response).status()).toBe(200);
      },
      async history(releaseId: number) {
        await page.goto(`${origin}/dashboard/releases/${releaseId}?tab=distribution`);
        await expect(page.getByRole("heading", { name: "Submission history" })).toBeVisible();
        await expect(page.getByText(/Attempt 1.*Historical/)).toBeVisible();
        await expect(page.getByText(/Attempt 2.*Current/)).toBeVisible();
        await page.screenshot({ path: ".cache/direnote-submission-history.png", fullPage: true });
      },
      async admin(releaseId: number) {
        const customerHistory = await context.request.get(`${origin}/api/releases/${releaseId}/submission-history`);
        expect((await customerHistory.json()).attempts.every((attempt: Record<string, unknown>) => !("payload" in attempt) && !("payloadDiff" in attempt))).toBe(true);
        expect((await context.request.get(`${origin}/api/admin/releases/${releaseId}/direnote/payload-preview`)).status()).toBe(403);
        const forbidden = await context.request.get(`${origin}/api/releases/${releaseId}/submission-history?admin=1`);
        expect(forbidden.status()).toBe(403);
        await context.addCookies([{ name: "hymn_admin_session", value: jwt.sign({ username: "admin", role: "admin" }, process.env.ADMIN_JWT_SECRET!, { expiresIn: "1h" }), url: origin }]);
        const history = await context.request.get(`${origin}/api/releases/${releaseId}/submission-history?admin=1`);
        expect(history.status()).toBe(200);
        const attempts = (await history.json()).attempts;
        expect(attempts).toHaveLength(2);
        expect(attempts[0].payload.tracks[1].trackLanguage).toBe("Hindi");
        expect(attempts[1].payload.tracks[1].trackLanguage).toBe("Instrumental");
        expect(attempts[1].payload.pin).toBeUndefined();
        expect(attempts[1].payload.client_id).toBeUndefined();
        await page.goto(`${origin}/admin?tab=releases&releaseId=${releaseId}`);
        await page.getByRole("navigation", { name: "Catalog sections" }).getByRole("button", { name: "distribution", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Submission history" })).toBeVisible();
        const previewResponse = page.waitForResponse(value => value.url().endsWith("/direnote/payload-preview"));
        await page.getByRole("button", { name: "View Sanitized DireNote Payload" }).click();
        const preview = await (await previewResponse).json();
        expect(preview.payload.tracks[1].trackLanguage).toBe("Instrumental");
        expect(preview.payload.pin).toBeUndefined();
        expect(preview.payload.client_id).toBeUndefined();
        await page.screenshot({ path: ".cache/direnote-admin-history.png", fullPage: true });
      },
      async stop() { await browser.close(); app.kill(); await stopped; }
    };
  } catch (error) { await browser.close(); app.kill(); await stopped; throw error; }
}
