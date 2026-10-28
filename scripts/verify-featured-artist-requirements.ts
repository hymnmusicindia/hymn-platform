import assert from "node:assert/strict";
import { matchFeaturedArtistName, featuredArtistProvisionIssues } from "../lib/featured-artist-contract";
import type { DireNotePayload } from "../lib/direnote";

const page = (artists: Array<{artist_id:number;name:string}>, has_more=false) => ({success:true,artists,pagination:{has_more}});
async function main() {
  assert.equal(await matchFeaturedArtistName(" Guest ",async()=>page([{artist_id:1,name:"GUEST"}])) ,"known");
  assert.equal(await matchFeaturedArtistName("Guest",async()=>page([])),"profile-required");
  assert.equal(await matchFeaturedArtistName("Guest",async()=>page([{artist_id:1,name:"Guest"},{artist_id:2,name:"guest"}])),"profile-required");
  assert.equal(await matchFeaturedArtistName("Guest",async()=>page([{artist_id:1,name:"Guest Band"}])),"profile-required");
  assert.equal(await matchFeaturedArtistName("Guest",async index=>index===1?page([],true):page([{artist_id:9,name:"Guest"}])) ,"known");
  let requests=0;assert.equal(await matchFeaturedArtistName("Guest",async()=>{requests++;return page([{artist_id:1,name:"Guest"}],true)}),"profile-required");assert.equal(requests,3);
  await assert.rejects(()=>matchFeaturedArtistName("Guest",async()=>({success:false,artists:[]})));
  const payload = {tracks:[{featuring_artists:[{name:"Guest"}]}],featuring_artists:[{name:"Guest"}]} as Pick<DireNotePayload,"tracks"|"featuring_artists">;
  assert.deepEqual(await featuredArtistProvisionIssues(payload,async()=>"known"),[]);
  const missing=await featuredArtistProvisionIssues(payload,async()=>"profile-required");assert.equal(missing.length,1);assert.match(missing[0].field,/tracks\.0\.featuring_artists/);assert.match(missing[0].message,/Instagram/);
  const unavailable=await featuredArtistProvisionIssues(payload,async()=>{throw Error("unavailable")});assert.match(unavailable[0].message,/could not verify/);
  payload.tracks[0].featuring_artists![0].instagram_url="https://instagram.com/guest";
  assert.equal((await featuredArtistProvisionIssues(payload,async()=>"profile-required")).length,1,"Instagram on one object must not hide a missing release-level identity");
  payload.featuring_artists![0].instagram_url="https://instagram.com/guest";
  assert.deepEqual(await featuredArtistProvisionIssues(payload,async()=>{throw Error("Must not call provider when provisioning details supplied")}),[]);
  console.log("PASS featured requirements: exact unique matches, pagination, ambiguity, unknown artists, unavailable provider, required Instagram and no HYMN card requirement for known names.");
}
main().catch(error=>{console.error(error);process.exitCode=1});
