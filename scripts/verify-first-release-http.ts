import { prisma } from "../lib/prisma";
import { startDireNoteBrowser } from "./direnote-browser-fixture";
import { startCheckoutMock, verifySubmissionCheckout } from "./verify-submission-checkout";
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
      await expect(browser.page.getByText("First release on us", { exact: false })).toBeVisible();
    }
    console.log("First-release desktop/mobile landing resumes the owned empty draft with a protected campaign URL and free offer.");
    await browser.page.context().addCookies([{ name: "hymn_session", value: jwt.sign({ sub: readyRelease.user.id, email: readyRelease.user.email, name: readyRelease.user.name, role: "customer" }, process.env.JWT_SECRET!, { expiresIn: "1h" }), url: "http://127.0.0.1:55441" }]);
    await browser.page.setViewportSize({ width: 1440, height: 900 });
    browser.page.on("response", async response => {
      if (response.url().includes("/api/distribution/") && response.request().method() === "POST") {
        const body = await response.json().catch(() => ({}));
        responses.push({ path: new URL(response.url()).pathname, status: response.status(), error: body.error });
      }
    });
    await browser.page.goto(`http://127.0.0.1:55441/distribution/start?campaign=first-release&edit=${readyRelease.releaseId}`);
    await browser.page.waitForLoadState("networkidle");
    // The review page resolves media-derived metadata before accepting the final
    // confirmation, just as a customer naturally does while reading the review.
    await browser.page.waitForTimeout(1600);
    await browser.page.getByRole("checkbox", { name: /I confirm that the release information above is correct/ }).check();
    const submit = browser.page.getByRole("button", { name: /Submit your release/ });
    await expect(submit).toBeEnabled();
    await submit.click();
    const result = await browser.page.waitForResponse(response => response.url().endsWith("/api/distribution/payment/verify-submit"), { timeout: 30_000 });
    expect(result.status(), await result.text()).toBe(201);
    expect((await prisma.release.findUniqueOrThrow({ where: { id: readyRelease.releaseId } })).status).toBe("UNDER_REVIEW");
    await browser.page.goto("http://127.0.0.1:55441/dashboard/releases");
    await expect(browser.page.getByText("Free release", { exact: true })).toBeVisible();
    await prisma.release.update({ where: { id: readyRelease.releaseId }, data: { status: "LIVE" } });
    await browser.page.reload();
    await expect(browser.page.getByText("Free release", { exact: true })).toHaveCount(0);
    console.log("Browser final review saved the complete draft and submitted the free release without opening payment checkout.");
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
