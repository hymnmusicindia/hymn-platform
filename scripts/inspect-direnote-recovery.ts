import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { redactDireNoteDiagnostic } from "../lib/direnote";

async function main() {
  const envFile = process.argv[2];
  if (!envFile) throw new Error("Provide an environment file path. This tool is read-only.");
  const config = parse(await readFile(envFile));
  if (!/^postgres(?:ql)?:\/\//.test(config.DATABASE_URL ?? "")) throw new Error("No PostgreSQL target found.");
  const db = new PrismaClient({ datasourceUrl: config.DATABASE_URL, log: [] });
  try {
    const releases = await db.release.findMany({ where: { title: { equals: "Magenta", mode: "insensitive" }, artistName: { contains: "gxrry", mode: "insensitive" } },
      select: { id: true, userId: true, title: true, status: true, upc: true, metadata: true, tracks: { select: { id: true, title: true, trackNumber: true, isrc: true, metadata: true } } } });
    for (const release of releases) {
      const attempts = await db.distributionSubmissionAttempt.findMany({ where: { releaseId: release.id }, select: { id: true, state: true, providerReference: true, startedAt: true, completedAt: true } });
      const meta = release.metadata as Record<string, any> | null;
      const tracks = release.tracks.map(({ metadata, ...track }) => {
        const m = metadata as Record<string, any> | null;
        return { ...track, language: m?.language ?? null, titleLanguage: m?.titleLanguage ?? null, nestedTitleLanguage: m?.metadata?.titleLanguage ?? null, version: m?.version ?? null };
      });
      console.log(JSON.stringify({ release: { ...release, metadata: undefined, language: meta?.language ?? null, tracks }, attempts }, null, 2));
      const logs = await db.direNoteLog.findMany({ where: { releaseId: release.id }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, createdAt: true, action: true, success: true, requestPayloadRedacted: true } });
      if (process.argv.includes("--payload-files") && release.id === 19) {
        const latest = logs.find(log => log.action === "release_submission" && Array.isArray((log.requestPayloadRedacted as any)?.tracks));
        const track = (latest?.requestPayloadRedacted as any)?.tracks?.[1];
        if (track) {
          await mkdir(".cache", { recursive: true });
          await writeFile(`.cache/direnote-release-${release.id}-track2-before.json`, JSON.stringify(redactDireNoteDiagnostic(track), null, 2));
        }
      }
      for (const log of logs) {
        const payload = log.requestPayloadRedacted as Record<string, any> | null;
        if (!Array.isArray(payload?.tracks)) continue;
        console.log(JSON.stringify({ logId: log.id, at: log.createdAt, action: log.action, success: log.success, albumLanguage: payload.albumLanguage,
          tracks: payload.tracks.map((track: Record<string, unknown>) => ({ trackName: track.trackName, trackLanguage: track.trackLanguage, trackVersion: track.trackVersion, explicitLyrics: track.explicitLyrics })) }, null, 2));
      }
    }
    const accepted = await db.direNoteLog.findMany({ where: { success: true, action: "release_submission", release: { status: { in: ["LIVE", "SCHEDULED", "DELIVERED"] } } }, take: 50, orderBy: { createdAt: "desc" }, select: { requestPayloadRedacted: true } });
    const languageEvidence = new Set<string>();
    for (const log of accepted) {
      const payload = log.requestPayloadRedacted as Record<string, any> | null;
      for (const track of Array.isArray(payload?.tracks) ? payload.tracks : []) languageEvidence.add(JSON.stringify({ language: track.trackLanguage ?? null, instrumentalVersion: /^instrumental$/i.test(track.trackVersion ?? "") }));
    }
    console.log(JSON.stringify({ acceptedCatalogueSampleCount: accepted.length, languageEvidence: [...languageEvidence].map(value => JSON.parse(value)) }));
    console.log(`Read-only inspection complete: ${releases.length} matching releases. No records changed.`);
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Read-only production inspection failed. Check connectivity and database schema; credentials were not printed."); process.exitCode = 1; });
