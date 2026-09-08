import { readFile } from "node:fs/promises";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getDireNoteConfig } from "../lib/direnote/direnote-config";
import { getDireNoteReleaseInformation } from "../lib/direnote/direnote-client";

let stage = "configuration";
async function main() {
  Object.assign(process.env, parse(await readFile(process.argv[2])));
  const config = getDireNoteConfig();
  if (config.releaseInformationEndpoint !== "https://api.direnotemedia.com/check_release_status" || !config.pin || !config.clientId) throw new Error("Configuration unavailable");
  const db = new PrismaClient();
  try {
    stage = "existing UPC lookup";
    const suppliedUpc = process.argv[3];
    if (suppliedUpc && !/^\d{12,13}$/.test(suppliedUpc)) throw new Error("Existing UPC is invalid");
    const existing = suppliedUpc ? { upc: suppliedUpc } : await db.release.findFirst({ where: { upc: { not: null }, direNoteStatus: { not: null } }, orderBy: { id: "desc" }, select: { upc: true } });
    if (!existing?.upc) throw new Error("Existing UPC unavailable");
    stage = "status request";
    const result = await getDireNoteReleaseInformation(existing.upc, { timeoutMs: 20000 });
    const body = result.data?.data ?? result.data;
    const release = body?.release;
    const tracks = Array.isArray(body?.tracks) ? body.tracks : [];
    const normalize = (value: unknown) => String(value ?? "").replace(/[\s-]+/g, "").toUpperCase();
    const checks = {
      httpStatus: result.httpStatus,
      authenticated: result.success && result.httpStatus === 200,
      upcMatched: normalize(release?.upc_code ?? release?.upc) === normalize(existing.upc),
      releaseData: Boolean(release && typeof release === "object"),
      trackCount: tracks.length,
      statusPresent: tracks.length > 0 && tracks.every((track: any) => typeof track.status === "string"),
      remarksPresent: tracks.length > 0 && tracks.every((track: any) => Object.hasOwn(track, "remarks"))
    };
    const verified = checks.authenticated && checks.upcMatched && checks.releaseData && checks.statusPresent && checks.remarksPresent;
    console.log(JSON.stringify({ liveStatus: verified ? "VERIFIED" : "NOT VERIFIED", ...checks, liveIngest: "NOT TESTED" }));
    if (!verified) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error(`Live DireNote endpoint connectivity was not verified (${stage}). No credentials or provider response data were printed.`); process.exitCode = 1; });
