import React from 'react';
import { createRoot } from 'react-dom/client';
import { ArtistJourney } from '../components/artist-journey';
import { defaultJourney } from '../lib/artist-journey-policy';
const state=window as typeof window&{writes:unknown[]};state.writes=[];
const data={name:'Artist',profile:{...defaultJourney,goal:'FIRST_RELEASE',mode:'ACTIVE',shortlist:[1]},beats:[{id:1,title:'Night drive',genre:'Hip Hop',bpm:90}],sources:{releases:[{id:1,title:'My next single',status:'DRAFT',audioUrl:'uploaded',artworkUrl:null,draftCompletionPercent:50,missingFields:['Artwork']}]},promises:[{id:crypto.randomUUID(),text:'Upload final artwork',party:'ARTIST',dueAt:'2027-01-05T10:00:00Z',status:'OPEN',version:1}],recaps:[{id:'recap',summary:'Discussed the sound and the release requirements.',nextSteps:'Confirm the licence and upload the final artwork.',senderName:'Aaditya',senderRole:'Artist success',publishedAt:new Date().toISOString(),beatIds:[1]}]};
window.fetch=async(_input,init)=>{if(init?.body){const body=JSON.parse(String(init.body));state.writes.push(body);if(body.action==='preferences')data.profile={...body.profile,revision:body.profile.revision+1};if(body.action==='promise-reported')data.promises[0].status='REPORTED_DONE';return new Response(JSON.stringify(body.action==='preferences'?{profile:data.profile}:{status:'REQUESTED'}));}return new Response(JSON.stringify(data));};
createRoot(document.getElementById('root')!).render(<ArtistJourney/>);
