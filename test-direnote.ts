import { buildDireNotePayloadForRelease } from "./lib/distribution-service";
import { getDetailedReleaseById } from "./lib/distribution-db";
import { redactDireNotePayload } from "./lib/direnote";

async function main() {
  const release = await getDetailedReleaseById(1);
  if (!release) {
    console.log("Release 1 not found");
    return;
  }
  const payload = await buildDireNotePayloadForRelease(release, { siteUrl: "http://localhost:3000" });
  console.log(JSON.stringify(redactDireNotePayload(payload), null, 2));
}

main().catch(console.error);
