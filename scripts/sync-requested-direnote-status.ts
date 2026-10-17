import { PrismaClient } from "@prisma/client";

async function main() {
  process.loadEnvFile(".env.hostinger");
  const { redactDireNoteDiagnostic } = await import("../lib/direnote");
  const db = new PrismaClient();
  try {
    const releases = await db.release.findMany({
      where: { upc: { in: ["3473620319345", "3473620319451", "3473620319079"] }, archivedAt: null },
      select: { id: true, title: true, upc: true, status: true, direNoteStatus: true, direNoteSyncError: true,
        distributionSubmissions: { select: { id: true, state: true, isCurrent: true, providerStatus: true, lastCheckedAt: true }, orderBy: { id: "desc" } } }
    });
    console.log(JSON.stringify({ before: releases }, null, 2));
    const { getDireNoteReleaseInformation } = await import("../lib/direnote/direnote-client");
    for (const release of process.argv.includes("--inspect-provider") ? releases : []) {
      const { reserveDireNoteRequest } = await import("../lib/direnote-rate-limit");
      await reserveDireNoteRequest("scoped_status_inspection", release.id);
      const result = await getDireNoteReleaseInformation(release.upc!, { timeoutMs: 20000 });
      console.log(JSON.stringify({ releaseId: release.id, provider: redactDireNoteDiagnostic(result.data), success: result.success }));
      const attempts = await db.distributionSubmissionAttempt.findMany({ where: { releaseId: release.id }, select: { id: true, upc: true, responseRedacted: true, rawStatusPayload: true } });
      const { upcFromDireNoteResponse } = await import("../lib/direnote-upc");
      console.log(JSON.stringify({ releaseId: release.id, identities: attempts.map(a => ({ id: a.id, upc: a.upc, responseUpc: upcFromDireNoteResponse(a.responseRedacted), statusUpc: upcFromDireNoteResponse(a.rawStatusPayload) })) }));
    }
    if (process.argv.includes("--apply")) {
      if (releases.length !== 3 || new Set(releases.map(r => r.upc)).size !== 3) throw new Error("Expected exactly one owned catalogue record per requested UPC.");
      const { syncDireNoteRelease } = await import("../lib/direnote-service");
      for (const release of releases) {
        try { console.log(JSON.stringify({ releaseId: release.id, result: await syncDireNoteRelease(release.id) })); }
        catch (error) { console.log(JSON.stringify({ releaseId: release.id, error: redactDireNoteDiagnostic(error instanceof Error ? error.message : "Sync failed") })); }
      }
    }
    console.log(JSON.stringify({ persisted: await db.release.findMany({ where: { id: { in: releases.map(r => r.id) } }, select: { id: true, title: true, status: true, direNoteStatus: true, direNoteSyncError: true, direNoteLastSyncedAt: true, tracks: { select: { title: true, isrc: true, distributorStatus: true } } } }) }, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Scoped inspection failed; no credentials printed."); process.exitCode = 1; });
