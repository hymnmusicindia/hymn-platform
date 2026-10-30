import React from 'react';
import {createRoot} from 'react-dom/client';
import {WorkStation} from '../components/team/work-station';
import {TeamAssistance} from '../components/team/assistance';
import type {WorkActivity} from '../lib/team/work-station-policy';
const state=window as typeof window&{writes:{resource:string;body:any}[]};state.writes=[];
const client={id:'client',name:'Customer',phone:'+919876543210',email:'customer@fixture.invalid',interests:[],status:'ACTIVE'};
const actor={id:'rep',name:'Kira',jobTitle:'Call representative',workspaceId:'workspace',owner:false,permissions:['tasks.create','tasks.update','tasks.complete','crm.outreach.manage','support.reply']};
const task={id:'task',title:'Call Customer',description:'Discuss distribution requirements.',ownerId:'rep',version:1,status:'TODO',priority:'HIGH',dueAt:new Date().toISOString(),recordType:null,recordId:null,clientId:'client',followUpContext:{kind:'CALL'} as {kind:string;workActivity?:WorkActivity},checklist:[],blocker:'',client};
const support={...task,id:'support',title:'Ticket #1: Callback request',recordType:'support',recordId:1,followUpContext:{kind:'SUPPORT_CALLBACK'} as typeof task.followUpContext,client:{...client,phone:''}};
const tasks=[task,support],history:any[]=[];
const ticket={id:1,subject:'Callback request',message:'Please help with my release.',status:'OPEN',details:{callbackRequestedAt:new Date().toISOString()},user:{name:client.name,email:client.email},replies:[] as any[]};
const api=async<T,>(resource:string,body?:any):Promise<T>=>{
 const path=resource.split('?')[0],params=new URLSearchParams(resource.split('?')[1]);
 if(body){state.writes.push({resource,body});const row=tasks.find(t=>t.id===body.id||t.id===body.taskId)||(body.ticketId?support:task);
  if(path==='workstation-start'){if(!row.followUpContext.workActivity||row.followUpContext.workActivity.status==='FINISHED'){row.followUpContext.workActivity={id:crypto.randomUUID(),kind:row===support?'SUPPORT':'CALL',memberId:actor.id,startedAt:new Date(Date.now()-60000).toISOString(),lastSavedAt:new Date().toISOString(),status:'RUNNING',pausedMs:0,notes:'',needs:'',commitments:'',nextAction:'',services:[],checklist:[]};row.status='IN_PROGRESS';row.version++;}return{id:row.id} as T;}
  if(path==='workstation-email'){ticket.replies.push({id:'reply',body:body.body,status:'QUEUED',createdAt:new Date().toISOString()});return{id:'mail',status:'QUEUED',channel:'support'} as T;}
  const a=row.followUpContext.workActivity!;Object.assign(a,body.draft);a.lastSavedAt=new Date().toISOString();row.version++;
  if(path==='workstation-pause'){a.status='PAUSED';a.pausedAt=new Date().toISOString();}
  if(path==='workstation-resume'){a.status='RUNNING';delete a.pausedAt;}
  if(path==='workstation-finish'){a.status='FINISHED';row.status=body.outcome==='NO_ANSWER'?'TODO':'COMPLETED';if(body.closeTicket)ticket.status='CLOSED';history.unshift({id:crypto.randomUUID(),occurredAt:a.startedAt,authorName:actor.name,authorRole:actor.jobTitle,discussion:a.notes,outcome:body.outcome});return{id:row.id,completed:true,status:row.status,email:body.outcome==='NO_ANSWER'?{status:'QUEUED'}:null} as T;}
  return{id:row.id} as T;
 }
 if(path==='workstation-activity'){const row=tasks.find(t=>t.id===params.get('id'))!;return structuredClone({task:row,activity:row.followUpContext.workActivity||null,client:row.client,ticket:row===support?ticket:null,history}) as T;}
 if(path==='workstation-tickets')return{items:ticket.status==='CLOSED'?[]:[ticket],total:ticket.status==='CLOSED'?0:1} as T;
 if(path==='clients-lookup')return{items:[client]} as T;
 return structuredClone({items:tasks.filter(t=>t.status!=='COMPLETED'),total:tasks.filter(t=>t.status!=='COMPLETED').length,active:tasks.find(t=>t.followUpContext.workActivity?.status==='PAUSED'),day:'2026-10-31',canSupport:true,canTeam:false,counts:[]}) as T;
};
createRoot(document.getElementById('root')!).render(<main style={{padding:16}}><WorkStation api={api} actor={actor}/><TeamAssistance navigate={()=>{}} owner={false} permissions={actor.permissions}/></main>);
