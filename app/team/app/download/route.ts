import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { getTeamAppRelease, teamAppDirectory } from "@/lib/team-app-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function download(head: boolean) {
  const release = await getTeamAppRelease();
  if (!release) return Response.json({ error: "The Android download is temporarily unavailable. Please try again shortly." }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } });
  const body = head ? null : Readable.toWeb(createReadStream(path.join(teamAppDirectory, release.file))) as ReadableStream<Uint8Array>;
  return new Response(body, { headers: {
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Disposition": `attachment; filename="HYMN-Team-${release.version}.apk"`,
    "Content-Length": String(release.size),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-HYMN-App-Version": release.version,
    ETag: `"${release.sha256}"`,
  } });
}
export async function GET() { return download(false); }
export async function HEAD() { return download(true); }
