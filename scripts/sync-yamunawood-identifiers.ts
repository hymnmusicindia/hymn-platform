import { readFileSync } from "node:fs";
import { parse } from "dotenv";
Object.assign(process.env, parse(readFileSync(".env.hostinger")));
async function main() {
  const { prisma } = await import("../lib/prisma");
  const { getDireNoteReleaseInformation } = await import("../lib/direnote/direnote-client");
  try {
    const releases = await prisma.release.findMany({ where: { title: { equals: "YAMUNAWOOD", mode: "insensitive" } }, include: { tracks: { orderBy: { trackNumber: "asc" } } } });
    console.log(JSON.stringify({ hymn: releases.map(r => ({ id:r.id,title:r.title,upc:r.upc,tracks:r.tracks.map(t => ({id:t.id,title:t.title,isrc:t.isrc})) })) }));
    const response = await getDireNoteReleaseInformation("3473620319345");
    if (!response.success) throw new Error("DireNote UPC lookup failed");
    const data = response.data;
    console.log(JSON.stringify({ provider: { release:data.release, tracks:data.tracks } }));
    if (!process.argv.includes("--apply")) return;
    const release = releases[0];
    const upc = "3473620319345";
    const normalize = (value:string) => value.toUpperCase().replace(/\s/g, "");
    if (releases.length !== 1 || release.id !== 81 || data.release?.album_name !== "YAMUNAWOOD" || data.release?.upc_code !== upc || data.tracks?.length !== 5 || release.tracks.length !== 5) throw Error("Release identity mismatch");
    const mapped = release.tracks.map(track => {
      const matches = data.tracks.filter(remote => normalize(remote.track_name) === normalize(track.title));
      if (matches.length !== 1 || !/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(matches[0].isrc)) throw Error("Track identity mismatch");
      return { id:track.id,title:track.title,trackNumber:track.trackNumber,isrc:matches[0].isrc };
    });
    if (new Set(mapped.map(t=>t.isrc)).size !== 5) throw Error("Duplicate provider ISRC");
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${81}::integer)`;
      const current = await tx.release.findUniqueOrThrow({where:{id:81}});
      if (current.upc !== release.upc || await tx.release.count({where:{id:{not:81},upc}})) throw Error("UPC conflict");
      for (const track of mapped) {
        if (await tx.track.count({where:{id:{not:track.id},isrc:track.isrc}})) throw Error("ISRC conflict");
        const prior = await tx.track.findUniqueOrThrow({where:{id:track.id}});
        if (prior.isrc !== release.tracks.find(t=>t.id===track.id)?.isrc) throw Error("Concurrent identifier change");
        if (prior.isrc !== track.isrc) await tx.externalIdentifierHistory.create({data:{releaseId:81,trackId:track.id,provider:"direnote",identifierType:"isrc",previousValue:prior.isrc,canonicalValue:track.isrc,source:"provider_verified_resubmission"}});
        await tx.track.update({where:{id:track.id},data:{isrc:track.isrc}});
      }
      if (current.upc !== upc) await tx.externalIdentifierHistory.create({data:{releaseId:81,provider:"direnote",identifierType:"upc",previousValue:current.upc,canonicalValue:upc,source:"provider_verified_resubmission"}});
      const metadata = (current.metadata ?? {}) as Record<string,any>;
      await tx.release.update({where:{id:81},data:{upc,direNoteSyncError:null,metadata:{...metadata,direNote:{...metadata.direNote,release:data.release,identifierSource:"provider_verified_resubmission"}}}});
      await tx.distributionSubmissionAttempt.updateMany({where:{releaseId:81,isCurrent:true},data:{upc,providerReference:upc,trackIdentifiers:mapped,rawStatusPayload:JSON.parse(JSON.stringify(data))}});
      await tx.distributionQueueEntry.updateMany({where:{releaseId:81},data:{direnoteRequestId:upc,direnoteResponse:{source:"provider_verified_resubmission",upc}}});
      await tx.auditLog.create({data:{actorType:"system",action:"DIRENOTE_IDENTIFIERS_SYNCED",entity:"release",entityId:"81",metadata:{previousUpc:current.upc,upc,tracks:mapped}}});
    },{timeout:30000});
    console.log(JSON.stringify({verified:await prisma.release.findUnique({where:{id:81},select:{title:true,upc:true,tracks:{orderBy:{trackNumber:"asc"},select:{title:true,isrc:true}}}})}));
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error("Identifier lookup failed; credentials omitted."); process.exitCode=1; });
