import assert from "node:assert/strict";
import { matchFeaturedArtistName, artistProvisionIssues } from "../lib/featured-artist-contract";
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
  const payload = {artists:[{name:"Primary"}],tracks:[{artists:[{name:"Track artist"}],featuring_artists:[{name:"Guest"}]}],featuring_artists:[{name:"Guest"}]} as Pick<DireNotePayload,"artists"|"tracks"|"featuring_artists">;
  assert.deepEqual(await artistProvisionIssues(payload,async()=>"known"),[]);
  const missing=await artistProvisionIssues(payload,async()=>"profile-required");assert.equal(missing.length,3);assert.equal(missing[0].field,"artists.0.instagram_url");assert.equal(missing[1].field,"tracks.0.artists.0.instagram_url");assert.equal(missing[2].field,"tracks.0.featuring_artists.0.instagram_url");assert.match(missing[0].message,/Instagram/);
  const unavailable=await artistProvisionIssues(payload,async()=>{throw Error("unavailable")});assert.match(unavailable[0].message,/could not verify/);
  payload.artists![0].instagram_url="https://instagram.com/primary";
  assert.equal((await artistProvisionIssues(payload,async()=>"profile-required")).some(issue=>issue.field==="artists.0.instagram_url"),false,"an Instagram profile should avoid a missing-profile correction");
  payload.tracks[0].artists![0].instagram_url="https://instagram.com/track-artist";
  payload.tracks[0].featuring_artists![0].instagram_url="https://instagram.com/guest";
  const remaining=await artistProvisionIssues(payload,async()=>"profile-required");assert.equal(remaining.length,1);assert.ok(remaining.some(issue=>issue.field==="featuring_artists.0.instagram_url"),"Instagram on a track object must not hide the missing release-level identity");
  payload.featuring_artists![0].instagram_url="https://instagram.com/guest";
  assert.deepEqual(await artistProvisionIssues(payload,async()=>{throw Error("Must not call provider when provisioning details supplied")}),[]);
  console.log("PASS artist requirements: exact unique matches, pagination, ambiguity, all artist roles, unavailable provider, required Instagram and known profiles.");
}
main().catch(error=>{console.error(error);process.exitCode=1});
