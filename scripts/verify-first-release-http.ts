import { prisma } from "../lib/prisma";
import { startDireNoteBrowser, fixtureWav } from "./direnote-browser-fixture";
import { startCheckoutMock, verifySubmissionCheckout, captureBrowserFixtureOrder } from "./verify-submission-checkout";
import { expect } from "@playwright/test";
import { verifyFirstReleaseDomain } from "./verify-first-release-domain";
import jwt from "jsonwebtoken";

async function main() {
  if (!process.env.DATABASE_URL?.startsWith("postgresql://fixture:fixture@127.0.0.1:55439/")) throw new Error("Isolated fixture database required.");
  const user = await prisma.user.create({ data: { googleId: "first-release-browser", name: "Fixture", email: "first-release-browser@example.test", role: "CUSTOMER", status: "ACTIVE", onboardingDone: true } });
  const mock = await startCheckoutMock();
  let browser: Awaited<ReturnType<typeof startDireNoteBrowser>> | undefined;
  const responses: Array<{ path: string; status: number; error?: unknown }> = [];
  try {
    browser = await startDireNoteBrowser(user.id);
    await verifyFirstReleaseDomain();
    const readyRelease = await verifySubmissionCheckout();
    const response = await browser.page.request.post("http://127.0.0.1:55441/api/distribution/drafts", { data: { promotionCode: "FIRST_RELEASE_FREE", attribution: { utm_source: "campaign-test" } } });
    expect(response.status()).toBe(201);
    const draftId = (await response.json()).draft.id;
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await browser.page.setViewportSize(viewport);
      await browser.page.emulateMedia({ reducedMotion: "reduce" });
      await browser.page.goto("http://127.0.0.1:55441/first-release?utm_source=campaign-test&campaign=invalid&edit=999");
      const resume = browser.page.getByRole("button", { name: "CONTINUE MY FREE RELEASE" });
      await expect(resume).toBeVisible();
      await browser.page.waitForTimeout(500);
      await resume.click();
      await expect(browser.page).toHaveURL(new RegExp(`campaign=first-release&edit=${draftId}`));
      // The focused artist step intentionally hides promotional chrome.
      await expect(browser.page.getByText("First release on us", { exact: false })).toBeAttached();
    }
    console.log("First-release desktop/mobile landing resumes the owned empty draft with a protected campaign URL and free offer.");
    await browser.page.context().addCookies([{ name: "hymn_session", value: jwt.sign({ sub: readyRelease.user.id, email: readyRelease.user.email, name: readyRelease.user.name, role: "customer" }, process.env.JWT_SECRET!, { expiresIn: "1h" }), url: "http://127.0.0.1:55441" }]);
    for (const width of [360, 390, 430, 768]) {
      await browser.page.setViewportSize({ width, height: 844 });
      await browser.page.goto(`http://127.0.0.1:55441/distribution/start?resume=${readyRelease.releaseId}&stage=2`);
      await browser.page.getByRole("button", { name: "Choose genre and subgenre", exact: true }).click();
      const genre = browser.page.getByRole("dialog", { name: "Choose genre and subgenre", exact: true });
      await expect(genre).toBeVisible();
      await genre.getByRole("textbox", { name: "Search genres or subgenres" }).fill("Indie Pop");
      await genre.getByRole("button", { name: "Indie Pop", exact: true }).click();
      await browser.page.getByRole("button", { name: "Choose a mood", exact: true }).click();
      const mood = browser.page.getByRole("dialog", { name: "Choose a mood", exact: true });
      await mood.getByRole("textbox", { name: "Search moods" }).fill("Romantic");
      await mood.getByRole("button", { name: "Romantic", exact: true }).click();
      await browser.page.waitForTimeout(1600);
      await expect(browser.page.locator(".release-workspace-state")).toContainText("Saved", { timeout: 20000 });
      expect(await browser.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
      const header = browser.page.locator(".release-workspace-header");
      expect(await header.evaluate(e => parseFloat(getComputedStyle(e).paddingLeft))).toBeGreaterThanOrEqual(12);
      expect(await header.evaluate(e => getComputedStyle(e).backgroundColor)).not.toBe("rgb(0, 0, 0)");
      await browser.page.screenshot({ path: `.cache/distribution-mobile-${width}.png`, fullPage: true });
    }
    await browser.page.goto(`http://127.0.0.1:55441/distribution/start?resume=${readyRelease.releaseId}&stage=5`);
    const legal = browser.page.locator(".legal-declaration-details").first();
    await expect(legal).not.toHaveAttribute("open", "");
    const consent = browser.page.getByRole("checkbox", { name: /I have read and agree to the Legal Declaration/ });
    await consent.uncheck();
    await legal.locator("summary").click(); await expect(legal).toHaveAttribute("open", "");
    await legal.locator("summary").click(); await expect(legal).not.toHaveAttribute("open", "");
    await expect(consent).not.toBeChecked(); await consent.check();
    await browser.page.waitForTimeout(1600);
    await expect(browser.page.locator(".release-workspace-state")).toContainText("Saved", { timeout: 20000 });
    console.log("PASS mobile 360/390/430/768px: padded header, searchable genre/mood sheets, no overflow and collapsible legal terms without automatic consent.");
    await browser.page.setViewportSize({ width: 1440, height: 900 });
    browser.page.on("response", async response => {
      if (response.url().includes("/api/distribution/") && response.request().method() === "POST") {
        const body = await response.json().catch(() => ({}));
        responses.push({ path: new URL(response.url()).pathname, status: response.status(), error: body.error });
      }
    });
    await browser.page.goto(`http://127.0.0.1:55441/distribution/start?campaign=first-release&edit=${readyRelease.releaseId}&stage=7`);
    await browser.page.waitForLoadState("networkidle");
    // The review page resolves media-derived metadata before accepting the final
    // confirmation, just as a customer naturally does while reading the review.
    await browser.page.waitForTimeout(1600);
    await browser.page.getByRole("checkbox", { name: /I have checked the music, credits, rights and delivery details/ }).check();
    const submit = browser.page.getByRole("button", { name: /Submit your release/ });
    await expect(submit).toBeEnabled();
    await submit.click();
    const result = await browser.page.waitForResponse(response => response.url().endsWith("/api/distribution/payment/verify-submit"), { timeout: 30_000 });
    expect(result.status(), await result.text()).toBe(201);
    expect(["UNDER_REVIEW", "APPROVED", "SUBMITTED"]).toContain((await prisma.release.findUniqueOrThrow({ where: { id: readyRelease.releaseId } })).status);
    await expect(browser.page.locator("[data-release-review-confirmation]")).toBeVisible();
    await expect(browser.page).toHaveURL(/submitted=1/);
    await browser.page.reload();
    await expect(browser.page.locator("[data-release-review-confirmation]")).toBeVisible();
    await browser.page.goto("http://127.0.0.1:55441/dashboard/releases");
    await expect(browser.page.getByText("Free release", { exact: true })).toBeVisible();
    await prisma.release.update({ where: { id: readyRelease.releaseId }, data: { status: "LIVE" } });
    await browser.page.reload();
    await expect(browser.page.getByText("Free release", { exact: true })).toHaveCount(0);
    console.log("Browser final review saved the complete draft and submitted the free release without opening payment checkout.");
    await browser.page.context().addCookies([{ name: "hymn_session", value: jwt.sign({ sub: readyRelease.paid.user.id, email: readyRelease.paid.user.email, name: readyRelease.paid.user.name, role: "customer" }, process.env.JWT_SECRET!, { expiresIn: "1h" }), url: "http://127.0.0.1:55441" }]);
    await browser.page.exposeFunction("captureFixturePayment", captureBrowserFixtureOrder);
    await browser.page.addInitScript(() => {
      (window as any).Razorpay = class {
        constructor(private options: any) {}
        on() {}
        async open() {
          const response = await (window as any).captureFixturePayment(this.options.order_id);
          const pending = this.options.handler(response);
          this.options.modal.ondismiss(); // Must not reject an in-flight success handler.
          await pending;
        }
      };
    });
    await browser.page.setViewportSize({ width: 390, height: 844 });
    await browser.page.goto(`http://127.0.0.1:55441/distribution/start?resume=${readyRelease.paid.releaseId}&stage=0`);
    await browser.page.getByRole("button", { name: "Remove track 1", exact: true }).click();
    await browser.page.locator('.release-batch-upload input[type="file"]').setInputFiles({ name: "Submission Fixture.wav", mimeType: "audio/wav", buffer: fixtureWav() });
    await expect(browser.page.locator(".release-audio-queue-item.is-ready")).toHaveCount(1, { timeout: 60000 });
    await browser.page.getByRole("button", { name: "Continue to cover artwork", exact: true }).click();
    await browser.page.locator(".release-workspace-header").getByRole("button", { name: "Review", exact: true }).click();
    await browser.page.waitForLoadState("networkidle"); await browser.page.waitForTimeout(1600);
    await browser.page.getByRole("checkbox", { name: /I have checked the music, credits, rights and delivery details/ }).check();
    await browser.page.route("**/api/distribution/payment/verify-submit", async route => {
      const response = await route.fetch(); expect(response.status(), await response.text()).toBe(201);
      await route.abort("failed"); // Server committed, mobile lost the response.
    });
    let checkoutStarted = false, uploadsAfterCheckout = 0;
    browser.page.on("response", response => { if (response.url().endsWith("/api/distribution/payment/create-order") && response.ok()) checkoutStarted = true; });
    browser.page.on("request", request => { if (checkoutStarted && request.method() === "POST" && /\/api\/(?:assets$|uploads\/sessions)/.test(request.url())) uploadsAfterCheckout++; });
    await browser.page.getByRole("button", { name: /Continue to Checkout/i }).click();
    await expect(browser.page.locator("[data-release-review-confirmation]")).toBeVisible({ timeout: 60000 });
    expect(uploadsAfterCheckout).toBe(0);
    expect((await prisma.release.findUniqueOrThrow({ where: { id: readyRelease.paid.releaseId } })).paymentStatus).toBe("paid");
    await expect(browser.page).toHaveURL(/submitted=1/); await browser.page.reload();
    await expect(browser.page.locator("[data-release-review-confirmation]")).toBeVisible();
    console.log("PASS paid mobile checkout: verified captured payment, dismiss race, lost-response recovery and submitted screen surviving reload.");
  } catch (error) {
    console.error("First-release browser diagnostics", responses, await browser?.page.locator("body").innerText().then(text => text.slice(-3500)).catch(() => ""));
    await browser?.page.screenshot({ path: ".cache/first-release-browser-failure.png", fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    await browser?.stop();
    await mock.stop();
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
