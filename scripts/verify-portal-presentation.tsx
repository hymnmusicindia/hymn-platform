import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { DashboardFrame } from "../components/dashboard-frame";

async function main() {
  const css = readFileSync(".next/dev/static/css/app/layout.css", "utf8") + readFileSync("app/styles/portal.css", "utf8");
  const markup = renderToStaticMarkup(<div className="hymn-portal-root"><header><div>HYMN</div></header><div className="hymn-portal"><DashboardFrame title="Artist workspace" subtitle="Your music" activeKey="releases" onSelect={() => {}} navItems={[
    { key:"overview", label:"Overview", group:"Home" },
    { key:"releases", label:"My releases", group:"Distribution" },
    { key:"analytics", label:"Trends", group:"Distribution" },
    { key:"earnings", label:"Earnings", group:"Distribution" },
    { key:"beat-store", label:"Browse beats", group:"Beatstore", href:"/beat-store" },
    { key:"studio", label:"Browse services", group:"Mixing / Mastering", href:"/studio" }
  ]}><section className="surface-card p-6"><h2>Your music, all in one place</h2><p>Manage releases, follow trends, and track reported earnings.</p><button className="btn-primary mt-5">Add release</button></section></DashboardFrame></div></div>);
  mkdirSync(".cache/portal", { recursive:true });
  const browser = await chromium.launch({ headless:true });
  try {
    const page = await browser.newPage();
    for (const theme of ["light", "dark"]) for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height:900 });
      await page.setContent(`<html data-theme="${theme}"><head><meta name="viewport" content="width=device-width, initial-scale=1"/><style>${css}</style></head><body>${markup}</body></html>`);
      const dimensions = await page.evaluate(() => ({ viewport:innerWidth, content:document.documentElement.scrollWidth }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
      expect(await page.locator(".portal-workspace").evaluate(element => getComputedStyle(element).display)).toBe("flex");
      expect(await page.locator(".dashboard-os-sidebar").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(8, 9, 11)");
      expect(await page.locator(".btn-primary").evaluate(element => getComputedStyle(element).color)).toBe("rgb(17, 22, 28)");
      if (width > 1024) await expect(page.getByRole("button", {name:"My releases", exact:true})).toBeVisible();
      else await expect(page.getByRole("button", {name:"Menu", exact:true})).toBeVisible();
      await page.screenshot({ path:`.cache/portal/${theme}-${width}.png`, fullPage:true });
    }
    console.log("Portal presentation passed: desktop/mobile, light/dark preferences, palette and overflow.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
