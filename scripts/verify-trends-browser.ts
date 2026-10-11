import { chromium, expect } from "@playwright/test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const fixture = "app/trends-preview";
async function main() {
  mkdirSync(fixture, { recursive: true });
  mkdirSync(".cache/trends", { recursive: true });
  writeFileSync(`${fixture}/page.tsx`, `import {AnalyticsOverview} from '@/components/analytics-overview';import {AnalyticsDashboard} from '@/components/analytics-dashboard';import {buildAnalyticsSummary} from '@/lib/analytics';export default function Page(){const summary=buildAnalyticsSummary([],'customer');return <main style={{padding:24,maxWidth:1100,margin:'auto'}}><AnalyticsOverview summary={summary}/><div style={{marginTop:24}}><AnalyticsDashboard/></div><div style={{marginTop:24}}><AnalyticsOverview summary={{...summary,state:'error'}}/></div></main>}`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route("**/api/**", route => route.fulfill({ json: {} }));
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("http://localhost:3015/trends-preview", { timeout: 120000 });
      const panel = page.getByRole("region", { name: "Analytics reporting status" }).first();
      await expect(panel.getByRole("heading", { name: "Verified analytics will appear here." })).toBeVisible();
      await expect(panel.getByRole("link", { name: "View catalogue" })).toHaveAttribute("href", "/dashboard/releases");
      await expect(page.getByRole("link", { name: "Open full analytics" })).toHaveAttribute("href", "/analytics");
      const explanation = panel.locator("details");
      await explanation.locator("summary").focus();
      await page.keyboard.press("Enter");
      await expect(explanation).toHaveAttribute("open", "");
      await expect(explanation.getByText(/Stores supply performance reports/)).toBeVisible();
      await page.keyboard.press("Enter");
      await expect(explanation).not.toHaveAttribute("open", "");
      expect(await panel.locator("h2").evaluate(node => getComputedStyle(node).color)).toBe("rgb(245, 246, 250)");
      expect(await page.getByRole("button", { name: "Try again" }).evaluate(node => getComputedStyle(node).color)).toBe("rgb(22, 27, 36)");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `.cache/trends/${width}.png`, fullPage: true });
      console.log(`Trends passed at ${width}px: dark empty/error states, valid actions, keyboard reporting disclosure, no overflow.`);
    }
  } finally { await browser.close(); rmSync(fixture, { recursive: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
