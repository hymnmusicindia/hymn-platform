export const CALL_DUTY_VERSION='call-rep-playbook-v2';
export const CALL_DUTIES=[
 'Review today’s scheduled calls, promised callbacks and overdue work before contacting anyone.',
 'Check the customer card, contact preference, previous activity and personalized conversation guide.',
 'Handle new-user onboarding and explicit help requests before inferred engagement opportunities.',
 'Assist with distribution drafts/corrections, beat selection/licensing, studio services, promotion and creator onboarding according to the customer’s actual interest.',
 'Use Artist journey to review listening signals, needs, commitments and promises; do not treat a listen as consent to call.',
 'Use the live activity timer; record the real outcome, needs, promises and next action. Pause when not working.',
 'Send individually reviewed HYMN email templates only when appropriate; queued does not mean delivered.',
 'Schedule the agreed next step inside available hours, honor opt-outs, and escalate QC, approvals, payments and unresolved blockers to authorized teammates.'
];
export function callDayLimit(preferences:unknown,minutes:number){
 const crm=(preferences as {crm?:{callTarget?:number;workRole?:string}}|null)?.crm;
 const capacity=Math.max(0,Math.floor(minutes/30));
 const target=typeof crm?.callTarget==='number'&&crm.callTarget>0?Math.floor(crm.callTarget):crm?.workRole==='researcher'?4:capacity;
 return Math.min(capacity,target);
}
export function callContext(value:unknown):Record<string,any>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};}
export function isCallWork(task:{eventKey:string|null;followUpContext:unknown}){
 const c=callContext(task.followUpContext);return Boolean(task.eventKey?.startsWith('support-call:')||task.eventKey?.endsWith(':call')||['CALL','SUPPORT_CALLBACK','FRIENDLY_INTRO'].includes(c.kind)||c.artistJourney&&c.contactMode==='CALL');
}
export function callPriority(task:{priority:string;dueAt:Date|null;followUpContext:unknown},now:Date){
 const c=callContext(task.followUpContext);
 return (c.kind==='SUPPORT_CALLBACK'||c.helpRequestId?1000:c.promiseId?900:c.sourceRecord?.urgent?800:0)+(task.dueAt&&task.dueAt<now?500:0)+({URGENT:300,HIGH:200,NORMAL:100,LOW:0}[task.priority]??0);
}
export const callTaskWhere={OR:[{eventKey:{startsWith:'support-call:'}},{eventKey:{endsWith:':call'}},{followUpContext:{path:['kind'],equals:'CALL'}},{followUpContext:{path:['kind'],equals:'SUPPORT_CALLBACK'}},{followUpContext:{path:['kind'],equals:'FRIENDLY_INTRO'}}]};
