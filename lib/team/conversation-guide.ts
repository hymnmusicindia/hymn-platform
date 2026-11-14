import {clientDetailsSummary} from '@/lib/client-details';
import {CLIENT_INTERESTS} from './client-interests';

export const INTRODUCTION_BRIEF='Use the live conversation guide for the assigned representative and this contact. Start with their stated needs, confirm preferences, and record the agreed next step.';
export function withoutLegacyIntroduction(description:string){
 const paragraphs=description.split(/\r?\n\s*\r?\n/);
 if(/^Introduce yourself as .+? from HYMN Music and ask if this is a convenient time\./i.test(paragraphs[0]||'') && /These are founder-supplied contacts, not newly researched acquisition leads\./.test(paragraphs[0]))return paragraphs.slice(1).join('\n\n');
 return description;
}
export function currentConversationBrief<T extends {description:string;followUpContext:unknown}>(task:T):T{
 const context=task.followUpContext&&typeof task.followUpContext==='object'&&!Array.isArray(task.followUpContext)?task.followUpContext as Record<string,unknown>:{};
 const legacyTip=typeof context.tip==='string'&&withoutLegacyIntroduction(context.tip)!==context.tip;
 return {...task,description:withoutLegacyIntroduction(task.description),...(legacyTip?{followUpContext:{...context,tip:INTRODUCTION_BRIEF}}:{})};
}
type Customer={isMinor?:boolean;clientDetails?:unknown;name?:string;email?:string;status?:string;interests?:string[];customerType?:string;preferredLanguage?:string;purpose?:string;registered?:boolean};
const topics:Record<string,string[]>={
 BEAT_PURCHASE:['Ask about genre, mood, reference tracks and budget.','Confirm the intended use, release plans and the licence rights needed before suggesting beats.','Offer a relevant Beat Store preview; explain the published licence terms without promising exclusivity.'],
 BEAT_SALES:['Ask about their beat catalogue and whether the recordings and samples are cleared.','Discuss producer onboarding, previews, pricing and the licence options they want to offer.'],
 DISTRIBUTION:['Ask whether this is a first release or an existing HYMN release, and confirm the intended release date.','Check what help they need with audio, artwork, artist profiles, metadata or a current correction.','Use the current published plan details; explain delivery and review steps without guaranteeing a live date.'],
 MIX_MASTER:['Ask about the track, genre, reference sound, available stems and deadline.','Clarify the requested service, deliverables, revisions and budget before suggesting an engineer.'],
 PROMOTION:['Ask about the release, intended audience, goals, budget and timing.','Discuss a relevant promotion option and how results will be measured; do not promise streams or placements.'],
 PLAYLIST_CURATION:['Ask about the track mood, genre, audience and release status.','Explain the submission and review process; do not guarantee playlist acceptance.'],
 BECOME_ENGINEER:['Ask about their engineering experience, portfolio and services.','Discuss the engineer application and review process and the next information needed.'],
};
const purposeServices:Record<string,string>={beat:'BEAT_PURCHASE',beats:'BEAT_PURCHASE',beat_store:'BEAT_PURCHASE',beatstore:'BEAT_PURCHASE',buy_beats:'BEAT_PURCHASE',producer:'BEAT_SALES',sell_beats:'BEAT_SALES',release:'DISTRIBUTION',distribution:'DISTRIBUTION',studio:'MIX_MASTER',mixing:'MIX_MASTER',mastering:'MIX_MASTER',promotion:'PROMOTION',playlist:'PLAYLIST_CURATION',engineer:'BECOME_ENGINEER'};
export function conversationGuide({repName,repRole,customer,selectedServices=[],service='',needs='',nextAction=''}:{repName:string;repRole?:string;customer:Customer|null;selectedServices?:string[];service?:string;needs?:string;nextAction?:string}){
 const name=repName.trim()||'your name',client=customer?.name?.trim()||'the customer';
 const intro=`Hello ${customer?.name?.trim()||"there"}, I'm ${name}${repRole?.trim()?`, ${repRole.trim()}`:""} from HYMN Music. Is now a convenient time for a brief conversation about your music?`;
 if(customer?.status && customer.status!=='ACTIVE')return {intro:'This contact is not active. Do not initiate outreach.',profile:[],focus:[],next:['Record the restriction and ask the responsible teammate to review the contact status.']};
 const valid=(values:string[])=>[...new Set(values.filter(value=>Object.hasOwn(topics,value)))];
 const selected=valid(selectedServices),saved=valid(customer?.interests||[]),purpose=(customer?.purpose||'').toLowerCase().trim().replace(/[\s-]+/g,'_');
 const explicitService=valid([service,purposeServices[service.toLowerCase().trim().replace(/[\s-]+/g,'_')]||'']);
 const keys=selected.length?selected:explicitService.length?explicitService:saved.length?saved:valid([purposeServices[purpose]||'']);
 let language=customer?.preferredLanguage||'';try{if(language)language=new Intl.DisplayNames(['en'],{type:'language'}).of(language)||language;}catch{/* Preserve the saved label when it is not a language code. */}
 const profile=[...clientDetailsSummary(customer?.clientDetails),customer?.registered?'Existing HYMN account — start with their current experience and the reason for this call.':null,customer?.customerType?`Customer type: ${customer.customerType}`:null,language?`Ask to continue in their preferred language: ${language}.`:null].filter((value):value is string=>Boolean(value));
 return {intro,profile,focus:keys.map(key=>({title:CLIENT_INTERESTS[key as keyof typeof CLIENT_INTERESTS],questions:topics[key]})),next:[
  ...(keys.length?[]:['Ask which service they need help with before introducing products or plans.']),
  ...(needs.trim()?[`Confirm their current request: ${needs.trim()}`]:[]),
  ...(nextAction.trim()?[`Check the agreed next action: ${nextAction.trim()}`]:[]),
  ...(!customer?.email?['Ask for their preferred email if they want written information.']:[]),
  'Confirm the preferred follow-up channel and time. Record the actual outcome and honour any request not to be contacted.',
 ]};
}
