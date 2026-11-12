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
  const deliveries=await prisma.release.findMany({where:{id:{in:releases.map(r=>r.id)}},select:{id:true,direNoteStatus:true,distributionSubmissions:{where:{provider:'direnote',isCurrent:true},select:{state:true,providerReference:true}}}});
  const evidence=new Map(deliveries.map(release=>[release.id,release]));
  const songs=new Set<string>();
  for(const release of releases){
    const delivery=evidence.get(release.id);
    const submitted=delivery?.distributionSubmissions.some(attempt=>attempt.state==='submitted');
    // Reconciliation describes delivery bookkeeping, not whether a synced recording is live.
    // Require a provider reference AND a matching live catalogue receipt before counting it.
    const reconciling=delivery?.direNoteStatus?.trim().toLowerCase()==='live'&&delivery.distributionSubmissions.some(attempt=>attempt.state==='reconciliation_required'&&Boolean(attempt.providerReference?.trim()));
    for(const track of release.tracks){
      const isrc=track.isrc?.trim().toUpperCase();
      if(!isrc||!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc))continue;
      if(submitted||reconciling&&hasMatchingLiveCatalogueReceipt(track.metadata,isrc))songs.add(isrc);
    }
  }
  return songs.size;
}

function hasMatchingLiveCatalogueReceipt(metadata:unknown,isrc:string){
  const root=metadata&&typeof metadata==='object'&&!Array.isArray(metadata)?metadata as Record<string,unknown>:{};
  const sync=root.direNote&&typeof root.direNote==='object'?root.direNote as Record<string,unknown>:{};
  const receipt=sync.external&&typeof sync.external==='object'?sync.external as Record<string,unknown>:{};
  return typeof receipt.isrc==='string'&&receipt.isrc.trim().toUpperCase()===isrc&&typeof receipt.status==='string'&&receipt.status.trim().toLowerCase()==='live';
}
