import React from 'react';
import {createRoot} from 'react-dom/client';
import {WorkStation} from '../components/team/work-station';
import {TeamAssistance} from '../components/team/assistance';
import {defaultJourney} from '../lib/artist-journey-policy';
import type {WorkActivity} from '../lib/team/work-station-policy';
const state=window as typeof window&{writes:{resource:string;body:any}[]};state.writes=[];
const client={id:'client',version:1,ownerId:'rep',name:'Customer',phone:'+919876543210',email:'customer@fixture.invalid',secondaryEmail:'',interests:['BEAT_PURCHASE'],registered:true,customerType:'artist',preferredLanguage:'hi',state:'',city:'',notes:'Private contact note',notesVisible:true,status:'ACTIVE'};
const actor={id:'rep',name:'Aaditya Giri',jobTitle:'Call representative',workspaceId:'workspace',owner:false,permissions:['clients.view','clients.manage','tasks.create','tasks.update','tasks.complete','crm.outreach.manage','support.reply']};
const task={id:'task',title:'Call Customer',description:'Introduce yourself as Kira from HYMN Music and ask if this is a convenient time. These are founder-supplied contacts, not newly researched acquisition leads.\n\nSpecific context: Discuss distribution requirements.',ownerId:'rep',version:1,status:'TODO',priority:'HIGH',dueAt:new Date().toISOString(),recordType:null,recordId:null,clientId:'client',followUpContext:{kind:'CALL'} as {kind:string;workActivity?:WorkActivity},checklist:[],blocker:'',client};
const support={...task,id:'support',title:'Ticket #1: Callback request',recordType:'support',recordId:1,followUpContext:{kind:'SUPPORT_CALLBACK'} as typeof task.followUpContext,client:{...client,phone:''}};
const tasks=[task,support],history:any[]=[],promises:any[]=[],recaps:any[]=[];
const ticket={id:1,subject:'Callback request',message:'Please help with my release.',status:'OPEN',details:{callbackRequestedAt:new Date().toISOString()},user:{name:client.name,email:client.email},replies:[] as any[]};
const api=async<T,>(resource:string,body?:any):Promise<T>=>{
 const path=resource.split('?')[0],params=new URLSearchParams(resource.split('?')[1]);
 if(body){state.writes.push({resource,body});const row=tasks.find(t=>t.id===body.id||t.id===body.taskId)||(body.ticketId?support:task);
  if(path==='artist-promise-save'){const promise={...body,status:'OPEN',version:1};promises.push(promise);return {id:'promise-event',promise} as T;}
  if(path==='artist-promise-complete'){Object.assign(promises.find(p=>p.id===body.id),{status:'DONE',version:2});return {completed:true} as T;}
  if(path==='artist-recap-publish'){recaps.push({id:'recap',...body,publishedAt:new Date().toISOString(),senderName:actor.name});return {id:'recap',url:'/artist-journey?recap=recap'} as T;}
  if(path==='artist-routing-save')return {saved:true} as T;
  if(path==='clients-save'){if(body.email==='duplicate@fixture.invalid')throw Error('A matching contact exists. Review the matching cards before saving.');if(body.version!==client.version)throw Error('Client changed. Refresh first.');Object.assign(client,body,{version:client.version+1});return structuredClone(client) as T;}
  if(path==='workstation-start'){if(!row.followUpContext.workActivity||row.followUpContext.workActivity.status==='FINISHED'){row.followUpContext.workActivity={id:crypto.randomUUID(),kind:row===support?'SUPPORT':'CALL',memberId:actor.id,startedAt:new Date(Date.now()-60000).toISOString(),lastSavedAt:new Date().toISOString(),status:'RUNNING',pausedMs:0,notes:'',needs:'',commitments:'',nextAction:'',services:[],checklist:[]};row.status='IN_PROGRESS';row.version++;}return{id:row.id} as T;}
  if(path==='workstation-email'){if(body.id==='ticket-task')ticket.replies.push({id:'reply',body:body.body,status:'QUEUED',createdAt:new Date().toISOString()});return{id:'mail',status:'QUEUED',channel:'support'} as T;}
  const a=row.followUpContext.workActivity!;Object.assign(a,body.draft);a.lastSavedAt=new Date().toISOString();row.version++;
  if(path==='workstation-pause'){a.status='PAUSED';a.pausedAt=new Date().toISOString();}
  if(path==='workstation-resume'){a.status='RUNNING';delete a.pausedAt;}
  if(path==='workstation-finish'){a.status='FINISHED';row.status=body.outcome==='NO_ANSWER'?'TODO':'COMPLETED';if(body.closeTicket)ticket.status='CLOSED';history.unshift({id:crypto.randomUUID(),occurredAt:a.startedAt,authorName:actor.name,authorRole:actor.jobTitle,discussion:a.notes,outcome:body.outcome});return{id:row.id,completed:true,status:row.status,email:body.outcome==='NO_ANSWER'?{status:'QUEUED'}:null} as T;}
  return{id:row.id} as T;
 }
 if(path==='artist-desk')return{items:[],promises:{open:0,overdue:0,done:0},routing:{services:['beats'],languages:['hi']}} as T;
 if(path==='artist-activity')return{registered:true,promises,recaps,insight:{profile:{...defaultJourney,goal:'FIND_BEAT',mode:'ACTIVE',contact:'CALL',analytics:true,shortlist:[1]},goal:'Find the right beat',blocker:'Clarify the licence before recording',suggestion:'Help the artist choose the right licence.',group:'ASSISTED',score:{score:65,level:'HIGH',reasons:[{key:'listening',kind:'OBSERVED',label:'Listened to a beat for 30 unique seconds',points:10}]},listens:[{beatId:1,title:'Fixture beat',seconds:60,uniqueSeconds:30,duration:60,sessions:2,lastAt:new Date().toISOString()}],readiness:[{id:1,title:'Fixture release',status:'DRAFT',percent:50,checks:[{label:'Audio uploaded',done:true},{label:'Artwork uploaded',done:false}],missing:['Artwork']}]}} as T;
 if(path==='workstation-activity'){const row=tasks.find(t=>t.id===params.get('id'))!;return structuredClone({task:row,activity:row.followUpContext.workActivity||null,client:row.client,ticket:row===support?ticket:null,history}) as T;}
 if(path==='workstation-tickets')return{items:ticket.status==='CLOSED'?[]:[ticket],total:ticket.status==='CLOSED'?0:1} as T;
 if(path==='clients-lookup')return{items:[client]} as T;
 if(path==='clients')return{items:[structuredClone(client)]} as T;
 if(path==='client-account-match')return{accounts:[]} as T;
 return structuredClone({items:tasks.filter(t=>t.status!=='COMPLETED'),total:tasks.filter(t=>t.status!=='COMPLETED').length,active:tasks.find(t=>t.followUpContext.workActivity?.status==='PAUSED'),day:'2026-10-31',canSupport:true,canTeam:false,counts:[]}) as T;
};
createRoot(document.getElementById('root')!).render(<main style={{padding:16}}><WorkStation api={api} actor={actor}/><TeamAssistance navigate={()=>{}} owner={false} permissions={actor.permissions}/></main>);
