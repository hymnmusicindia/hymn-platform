import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { DIRENOTE_GENRE_CATALOG, DIRENOTE_LANGUAGES, DIRENOTE_CONTENT_TYPES } from "../lib/direnote-config";
import { getDireNoteConfig } from "../lib/direnote/direnote-config";

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("https://distribution.direnotemedia.com/dnm_api");
    const contract = await page.evaluate(() => {
      const tables = [...document.querySelectorAll("table")];
      const taxonomy = tables.find(table => [...table.querySelectorAll("tr")].some(row => row.querySelector("td")?.textContent?.trim() === "Pop"));
      if (!taxonomy) throw new Error("Official genre table was not found.");
      const genres = Object.fromEntries([...taxonomy.querySelectorAll("tr")].flatMap(row => {
        const cells = [...row.querySelectorAll("td")].map(cell => cell.textContent?.trim() ?? "");
        return cells.length === 2 ? [[cells[0], cells[1].split(",").map(value => value.trim())]] : [];
      }));
      const heading = [...document.querySelectorAll("h2,h3,h4")].find(element => /6b\.\s*Languages/.test(element.textContent ?? ""));
      let element = heading?.nextElementSibling;
      let languages: string[] = [];
      while (element && !/^H[234]$/.test(element.tagName)) {
        if (element.textContent?.includes("Instrumental")) languages = element.textContent.trim().split(",").map(value => value.trim());
        element = element.nextElementSibling;
      }
      return { genres, languages, text: document.body.innerText };
    });
    assert.deepEqual(contract.genres, DIRENOTE_GENRE_CATALOG);
    assert.deepEqual(contract.languages, [...DIRENOTE_LANGUAGES]);
    for (const value of DIRENOTE_CONTENT_TYPES) assert(contract.text.includes(value));
    for (const key of ["DIRENOTE_INGEST_ENDPOINT", "DISTRIBUTOR_RELEASE_ENDPOINT", "DIRENOTE_RELEASE_INFORMATION_ENDPOINT", "DIRENOTE_REVENUE_REPORT_ENDPOINT"]) delete process.env[key];
    const config = getDireNoteConfig();
    for (const endpoint of [config.endpoint, config.releaseInformationEndpoint, config.revenueReportEndpoint]) assert(contract.text.includes(endpoint));
    assert.match(contract.text, /albumMood\s+No\s+string/);
    console.log(`Official API comparison passed: ${Object.keys(contract.genres).length} genre families, every subgenre, ${contract.languages.length} languages, three content types, all three endpoint URLs, and optional free-text mood.`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
