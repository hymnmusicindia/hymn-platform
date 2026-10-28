import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { getDireNoteConfig } from "./direnote/direnote-config";
import { requestDireNoteV24 } from "./direnote/v24-client";
import { reserveDireNoteRequest, enforceDireNoteResponseLimit } from "./direnote-rate-limit";
import { matchFeaturedArtistName, featuredArtistProvisionIssues, type FeaturedArtistMatch } from "./featured-artist-contract";
import type { DireNotePayload } from "./direnote";

const pending = new Map<string,Promise<FeaturedArtistMatch>>();
export async function resolveFeaturedArtistName(name: string): Promise<FeaturedArtistMatch> {
  const config = getDireNoteConfig();
  if (!config.isConfigured) throw Error("Artist verification is temporarily unavailable.");
  const key = createHash("sha256").update(`${config.endpoint}:${config.clientId}:${name.trim().replace(/\s+/g," ").toLowerCase()}`).digest("hex");
  const cached = await prisma.direNoteLog.findFirst({where:{action:"featured_artist_match",createdAt:{gte:new Date(Date.now()-5*60_000)},requestPayloadRedacted:{path:["key"],equals:key}},orderBy:{createdAt:"desc"},select:{responseJson:true}});
  const state = (cached?.responseJson as {state?:unknown} | null)?.state;
  if (state === "known" || state === "profile-required") return state;
  if (pending.has(key)) return pending.get(key)!;
  const request = (async () => {
    const result = await matchFeaturedArtistName(name,async page=>{
      await reserveDireNoteRequest("featured_artist_lookup");
      const response = await requestDireNoteV24("list_artists",{search:name.trim(),page,per_page:100,sort_by:"name"},{timeoutMs:15_000});
      await enforceDireNoteResponseLimit(response);
      if (!response.success) throw Error("Artist lookup was not confirmed.");
      return response.data;
    });
    await prisma.direNoteLog.create({data:{action:"featured_artist_match",success:true,requestPayloadRedacted:{key},responseJson:{state:result}}});
    return result;
  })();
  pending.set(key,request);
  try { return await request; } finally { pending.delete(key); }
}
export const getFeaturedArtistProvisionIssues = (payload: Pick<DireNotePayload,"tracks"|"featuring_artists">) => featuredArtistProvisionIssues(payload,resolveFeaturedArtistName);
