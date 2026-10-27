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
console.log("PASS delivery contract: featured artists and selected store links reach release/track payloads; producer credit uses artist name without requiring legal name.");
