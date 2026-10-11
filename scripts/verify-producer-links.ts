import assert from "node:assert/strict";
import { featuredProducerBeats, producerSocialLinks } from "../lib/producer-links";
import type { StorefrontBeat } from "../lib/beat-store";
import type { ProducerProfile } from "../lib/types";

const beats = Array.from({length:9},(_,index)=>({id:index+1,createdAt:`2026-10-${String(index+1).padStart(2,"0")}T00:00:00Z`})) as StorefrontBeat[];
const ranked = featuredProducerBeats(beats,new Map([[2,4],[1,4],[4,2]]));
assert.deepEqual(ranked.map(beat=>beat.id),[2,1,4,9,8,7]);
assert.equal(beats[0].id,1,"Ranking does not mutate the catalogue");
assert.deepEqual(featuredProducerBeats(beats,new Map()).map(beat=>beat.id),[9,8,7,6,5,4]);
assert.deepEqual(featuredProducerBeats([],new Map()),[]);
const profile={instagramUrl:"https://instagram.com/producer",youtubeUrl:"javascript:alert(1)",spotifyUrl:"https://user:password@spotify.com",websiteUrl:"/relative"} as ProducerProfile;
assert.deepEqual(producerSocialLinks(profile).map(link=>link.id),["instagram"]);
assert.equal(producerSocialLinks({} as ProducerProfile).length,0);
assert.equal(producerSocialLinks({...profile,websiteUrl:"https://example.com"}).length,2);
console.log("PASS six-beat sales ranking, newest fallback, deterministic ties and safe social links");
