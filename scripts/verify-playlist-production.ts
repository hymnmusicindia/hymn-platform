import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import assert from "node:assert/strict";
Object.assign(process.env, parse(readFileSync(".env.hostinger")));

async function main() {
  const { prisma } = await import("../lib/prisma");
  try {
    const listings = await prisma.playlistReviewListing.findMany({ where: { isHymn: true }, select: { name: true, feeMinor: true, status: true } });
    assert.equal(listings.length, 4); assert.ok(listings.every(row => row.feeMinor === 5000 && row.status === "APPROVED"));
    const requests = await prisma.playlistReviewRequest.count();
    const mail = await prisma.playlistReviewMail.count();
    if (requests || mail) throw new Error("There are active marketplace records. Refusing a no-customer-impact automation smoke test.");
    const { GET } = await import("../app/api/cron/playlist-reviews/route");
    assert.equal((await GET(new Request("https://hymnmusic.fun/api/cron/playlist-reviews"))).status, 401);
    assert.ok(process.env.CRON_SECRET);
    const response = await GET(new Request("https://hymnmusic.fun/api/cron/playlist-reviews", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    assert.equal(response.status, 200);
    const summary = await response.json(); assert.equal(summary.sent, 0); assert.equal(summary.refunded, 0); assert.deepEqual(summary.errors, []);
    console.log(JSON.stringify({ listings, protectedCron: "passed", smokeTest: summary, realPaymentsCreated: 0, customerEmailsSent: 0 }));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Production smoke test failed safely."); process.exitCode = 1; });
