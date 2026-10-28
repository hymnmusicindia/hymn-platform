import assert from "node:assert/strict";
import { buildDireNotePayload } from "../lib/direnote";
import type { Release, ArtistProfile } from "../lib/types";

const featured = { id:20, name:"Featured Guest", spotifyUrl:"https://open.spotify.com/artist/52BkE1owdr1Oz5duroCyHL", instagramUrl:"https://www.instagram.com/featuredguest" } as ArtistProfile;
const release = {
  releaseType:"single", releaseTitle:"Credit fixture", artistName:"Main Artist", genre:"Pop", language:"Hindi", contentType:"Original/Exclusive Licensed",
  tracks:[{trackTitle:"Credit fixture", primaryArtist:"Main Artist", featuredArtists:featured.name, featuredArtistProfileIds:[featured.id], audioUrl:"https://example.com/master.wav", contributors:[{role:"producer",artistName:"Public Producer",legalName:""}]}]
} as unknown as Release;
const payload = buildDireNotePayload(release,{artistProfiles:[featured],siteUrl:"https://example.com"});
for (const artists of [payload.featuring_artists,payload.tracks[0].featuring_artists]) {
  assert.equal(artists?.[0].name,featured.name);
  assert.equal(artists?.[0].spotify_url,featured.spotifyUrl);
}
assert.deepEqual(payload.tracks[0].producers,["Public Producer"]);
release.tracks![0].featuredArtists="Featured Guest, Name Only Guest";
release.metadata={instagramUrl:"https://instagram.com/mainartist",youtubeArtistUrl:"https://youtube.com/@mainartist"};
const mixed=buildDireNotePayload(release,{artistProfiles:[featured,{...featured,id:21,name:"Name Only Guest",spotifyUrl:"https://open.spotify.com/artist/66x9igCk2Vdjrhm1ULpe6r"}],siteUrl:"https://example.com"});
for(const artists of [mixed.featuring_artists,mixed.tracks[0].featuring_artists]) {
  assert.equal(artists?.[0].spotify_url,featured.spotifyUrl);
  assert.equal(artists?.[1].name,"Name Only Guest");
  assert.equal(artists?.[1].instagram_url,undefined,"a name-only guest must not inherit the primary artist's Instagram");
  assert.equal(artists?.[1].youtube_url,undefined);
  assert.equal(artists?.[1].spotify_url,undefined,"unselected cards are never attached by name");
}
console.log("PASS delivery contract: featured artists and selected store links reach release/track payloads; producer credit uses artist name without requiring legal name.");
