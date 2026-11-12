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

/** A song counts once even when reissued on several releases. Only HYMN-delivered catalogue qualifies. */
export async function oacArtistLiveSongCount(userId:number,artistId:number) {
  const releases=await oacArtistLiveReleases(userId,artistId);
  const delivered=await prisma.release.findMany({where:{id:{in:releases.map(r=>r.id)},distributionSubmissions:{some:{provider:'direnote',state:'submitted',isCurrent:true}}},select:{id:true}});
  const ids=new Set(delivered.map(r=>r.id));
  return new Set(releases.filter(r=>ids.has(r.id)).flatMap(r=>r.tracks.map(t=>t.isrc?.trim().toUpperCase()).filter((isrc):isrc is string=>Boolean(isrc&&/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc))))).size;
}
