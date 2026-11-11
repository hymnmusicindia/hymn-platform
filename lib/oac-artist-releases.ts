import 'server-only';
import { prisma } from './prisma';
import type { Prisma } from '@prisma/client';
import { attachedArtistProfileIds } from './artist-store-links';

/** Count releases once, using owned canonical primary-artist links, never names. */
export async function oacArtistLiveReleases(userId:number,artistId:number){
  const releases=await prisma.release.findMany({where:{...oacArtistReleaseWhere(userId,artistId),status:'LIVE',archivedAt:null},select:{id:true,upc:true,artistProfileId:true,tracks:{select:{id:true,isrc:true,metadata:true},orderBy:{id:'asc'}}},orderBy:{id:'desc'}});
  return releases.flatMap(release=>{
    const tracks=release.tracks.filter(track=>attachedArtistProfileIds(track.metadata,release.artistProfileId).includes(artistId));
    return tracks.length||(!release.tracks.length&&release.artistProfileId===artistId)?[{...release,tracks}]:[];
  });
}

/** Legacy OAC history can reference a release whose artist link is stored on a track. */
export function oacArtistReleaseWhere(userId:number,artistId:number):Prisma.ReleaseWhereInput{
  return {userId,OR:[{artistProfileId:artistId},{tracks:{some:{OR:[{metadata:{path:['artistProfileIds'],array_contains:[artistId]}},{metadata:{path:['metadata','artistProfileIds'],array_contains:[artistId]}}]}}}]};
}
