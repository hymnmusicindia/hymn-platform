import { chromium, expect } from "@playwright/test";
import { mkdirSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import path from "node:path";
const dir = path.resolve("app/splits-preview");
const fixture = `import { SplitsDashboard } from "@/components/splits-dashboard";
import { AccountHandle } from "@/components/account-handle";
export default function Page(){return <main style={{padding:24,maxWidth:1300,margin:"auto"}}><div className="profile-identity" style={{maxWidth:320,marginBottom:24}}><p className="profile-identity-name">Aditya Ujjain</p><p className="profile-identity-email">aditya@example.com</p><AccountHandle compact/></div><SplitsDashboard releases={[{id:1,releaseTitle:"Red Carpet",tracks:[{id:7,title:"Red Carpet"}]}] as any}/></main>}`;
async function main() {
    mkdirSync(".cache/splits", { recursive: true });
    mkdirSync(dir);
    writeFileSync(path.join(dir, "page.tsx"), fixture);
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.addInitScript(() => localStorage.setItem("hymn-theme", "dark"));
        const errors: string[] = [];
        page.on("pageerror", e => errors.push(e.message));
        let accepted = false;
        let inviteBody: any;
        let responseBody: any;
        let tag = "@aditya#1111";
        const dataset = () => ({ created: [{ id: 4, releaseId: 1, trackId: null, status: "pending_acceptance", totalSharePercent: "25", release: { title: "Red Carpet" }, recipients: [{ id: 8, recipientName: "Tavish Relhan", role: "Producer", sharePercent: "25", inviteStatus: "pending", inviteMethod: "registered_email" }] }], received: [], requests: accepted ? [] : [{ id: 9, release: { title: "Baatein" }, splitRecord: { owner: { name: "Tavish" } }, role: "Primary Artist", sharePercent: "40", payoutEligible: true, note: "Agreed artist share" }], earnings: [] });
        await page.route("**/api/splits", route => route.fulfill({ json: route.request().method() === "POST" ? { split: { id: 4 } } : dataset() }));
        await page.route("**/api/payout/credentials", route => route.fulfill({ json: { credential: { status: "missing" } } }));
        await page.route("**/api/user/handle", route => { if (route.request().method() === "PATCH")
            tag = route.request().postDataJSON().tag; return route.fulfill({ json: { tag } }); });
        await page.route("**/api/splits/recipients?**", route => route.fulfill({ json: { artist: { id: 2, name: "Tavish Relhan", tag: "@tavish#0022" } } }));
        await page.route("**/api/splits/invites", route => { inviteBody = route.request().postDataJSON(); return route.fulfill({ json: { invite: { id: 12, deliveryStatus: "sent" } } }); });
        await page.route("**/api/splits/invites/9/accept", route => { accepted = true; responseBody = route.request().postDataJSON(); return route.fulfill({ json: { invite: { id: 9 } } }); });
        await page.route("**/api/splits/invites/join-code", route => route.fulfill({ json: { preview: { id: 10, releaseName: "Nagma", ownerName: "Tavish", role: "Producer", sharePercent: 20 } } }));
        await page.route("**/api/splits/invites/10/accept", route => { responseBody = route.request().postDataJSON(); return route.fulfill({ json: { invite: { id: 10 } } }); });
        for (const width of [1440, 390, 320]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.goto("http://localhost:3015/splits-preview", { timeout: 120000 });
            await expect(page.getByText("Every contribution.")).toBeVisible({ timeout: 30000 });
            await expect(page.getByText("Invitations to review")).toBeVisible();
            await page.waitForFunction(() => Object.keys(document.querySelector(".split-heading button") || {}).some(k => k.startsWith("__reactProps$")));
            await page.screenshot({ path: `.cache/splits/overview-${width}.png` });
            await page.getByRole("button", { name: "Create an agreement" }).click();
            await expect(page.getByRole("heading", { name: "Invite an artist", exact: true })).toBeVisible();
            await page.getByLabel("Release", { exact: true }).selectOption("1");
            await page.getByRole("textbox", { name: "Email or unique handle" }).fill("@tavish#0022");
            await page.getByRole("button", { name: "Find", exact: true }).click();
            await expect(page.locator(".split-artist")).toContainText("Tavish Relhan");
            await page.getByLabel("Royalty share (%)").fill("25");
            await page.getByRole("button", { name: "Send split invitation" }).click();
            await expect(page.getByRole("status")).toContainText("Invitation sent");
            expect(inviteBody.recipientHandle).toBe("@tavish#0022");
            expect(inviteBody.splitRecordId).toBe(4);
            await page.screenshot({ path: `.cache/splits/agreements-${width}.png` });
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        }
        await page.getByRole("button", { name: /^Invitations/ }).click();
        await expect(page.getByRole("button", { name: "Accept 40% share" })).toBeDisabled();
        await page.getByRole("checkbox").check();
        await page.getByRole("button", { name: "Accept 40% share" }).click();
        await expect(page.getByRole("status")).toContainText("Your share is accepted");
        await page.getByRole("button", { name: "Join with code", exact: true }).click();
        await page.getByLabel("Invitation code").fill("HYMN-ABC234");
        await page.getByRole("button", { name: "Review invitation", exact: true }).click();
        await page.getByRole("checkbox").check();
        await page.getByRole("button", { name: "Accept 20% share" }).click();
        await expect(page.getByRole("status")).toContainText("Your share is accepted");
        expect(responseBody.code).toBe("HYMN-ABC234");
        await page.getByRole("button", { name: "Edit", exact: true }).click();
        await page.getByLabel("Handle name").fill("aditya_new");
        await page.getByLabel("Four-digit number").fill("0012");
        await page.getByRole("button", { name: "Save handle" }).click();
        await expect(page.getByRole("button", { name: "@aditya_new#0012", exact: true })).toBeVisible();
        expect(errors).toEqual([]);
        console.log("Splits UI passed at 1440/390/320px: no horizontal overflow, artist search, invitation payload, consent gate, code proof and handle editing. No real email sent.");
    }
    finally {
        await browser.close();
        unlinkSync(path.join(dir, "page.tsx"));
        rmdirSync(dir);
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
