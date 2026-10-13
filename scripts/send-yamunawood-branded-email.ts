import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { parse } from "dotenv";

Object.assign(process.env, parse(readFileSync(".env.hostinger")));
async function main() {
  const { getPublicAppUrl } = await import("../lib/public-app-url");
  const { renderManualEmail } = await import("../lib/email/manual-email-template");
  const { prisma } = await import("../lib/prisma");
  try {
    const release = await prisma.release.findUniqueOrThrow({ where: { id: 81 }, select: { title: true, status: true, upc: true, userId: true, tracks: { orderBy: { trackNumber: "asc" }, select: { title: true, isrc: true } } } });
    if (release.title !== "YAMUNAWOOD" || release.upc !== "3473620319017" || release.status !== "DISTRIBUTOR_PROCESSING") throw Error("Release status has changed; review the message before sending.");
    const url = getPublicAppUrl() + "/dashboard/releases/81";
    const content = renderManualEmail({ requestId: "d17c3091-0778-465f-a116-38b866c20081", to: "deepitkamboj09@gmail.com", subject: "YAMUNAWOOD is now under review | HYMN Music", title: "Your release is now under review", greeting: "Hi Deepit,", blocks: [
      { type: "paragraph", text: "YAMUNAWOOD has been successfully delivered to DireNote and is now under review. Your HYMN catalogue has been updated with the album UPC and the confirmed ISRC for each track." },
      { type: "notice", text: `Release: YAMUNAWOOD\nUPC: ${release.upc}\nStatus: Under review\n\n${release.tracks.map(t => `${t.title}: ${t.isrc}`).join("\n")}\n\nYour release is not live in stores yet.` },
      { type: "button", label: "View your release", url },
      { type: "paragraph", text: "We will notify you when the review status changes. Sign in with deepitkamboj09@gmail.com to view your artwork, credits, identifiers and release details.\n\nNeed help? Reply to this email and the HYMN team will assist you." }
    ] });
    if (!process.argv.includes("--send")) {
      await mkdir(".cache", { recursive: true });
      await writeFile(".cache/yamunawood-branded-email.html", content.html);
      console.log(JSON.stringify({ preview: ".cache/yamunawood-branded-email.html", subject: content.subject, link: url }));
      return;
    }
    const { sendTransactionalEmail } = await import("../lib/email/send-transactional-email");
    const result = await sendTransactionalEmail({ ...content, to: "deepitkamboj09@gmail.com", userId: release.userId, template: "manual_branded_email", eventKey: "release:81:dashboard-under-review:branded-v1", entityType: "release", entityId: 81 });
    console.log(JSON.stringify(result));
    if (!["sent", "duplicate_skipped"].includes(result.status)) process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error("Branded email operation failed; credentials omitted."); process.exitCode = 1; });
