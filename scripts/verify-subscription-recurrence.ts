import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdirSync} from 'node:fs';
import {ANNUAL_RECURRENCE_PROFILE as profile,validateCompatibleAnnualPlan,validSubscriptionCycleCount,subscriptionPaymentFailureMessage} from '../lib/subscription-recurrence';

async function main(){
 const sourceId='plan_annual_source',compatibleId='plan_annual_compatible';process.env.RAZORPAY_PLAN_YEARLY_PLUS=sourceId;
 const source={id:sourceId,period:'yearly',interval:1,item:{amount:199900,currency:'INR'}};
 const compatible={...source,id:compatibleId,period:'monthly',interval:12,notes:{hymn_source_plan_id:sourceId,hymn_recurrence_profile:profile}};
 const expected={amount:199900,currency:'INR',months:12,planEnv:'fixture'};
 validateCompatibleAnnualPlan(compatible,sourceId,expected);
 for(const invalid of [{...compatible,interval:1},{...compatible,period:'yearly',interval:1},{...compatible,item:{amount:1999,currency:'INR'}},{...compatible,notes:{...compatible.notes,hymn_source_plan_id:'another-plan'}}])assert.throws(()=>validateCompatibleAnnualPlan(invalid,sourceId,expected));
 for(const value of [0,-1,NaN,Infinity,1.5,101])assert.throws(()=>validSubscriptionCycleCount(value));
 assert.equal(validSubscriptionCycleCount(20),20);assert.equal(validSubscriptionCycleCount(200,6),200);assert.match(subscriptionPaymentFailureMessage('invalid validateRecurrencePatternRuleValue-"YEARLY"-recurrenceValue'),/Close checkout and retry/);assert.equal(subscriptionPaymentFailureMessage('Card declined'),'Card declined');
 let s:any;let serial=Promise.resolve();const reset=()=>{s={local:{id:16,userId:77,plan:'yearly_plus',status:'created',razorpaySubscriptionId:'sub_old'},old:{id:'sub_old',plan_id:sourceId,status:'created',paid_count:0,auth_attempts:0,current_start:null,created_at:Math.floor(Date.now()/1000)-900},payments:[{id:'pay_failed',invoice_id:'inv_old',status:'failed',created_at:Math.floor(Date.now()/1000)-600}],invoices:[{id:'inv_old',status:'issued',amount_paid:0,payment_id:null}],creates:0,cancels:0,audits:[],mapping:true};};reset();
 const db:any={$queryRaw:async()=>[],subscription:{findUnique:async()=>s.local,update:async({data}:any)=>{s.local={...s.local,...data};return s.local;},upsert:async({create,update}:any)=>{s.local={id:16,...(s.local?{...s.local,...update}:create)};return s.local;}},subscriptionPayment:{count:async()=>s.localPayments||0},subscriptionPlanVersion:{upsert:async()=>({id:4,product:'yearly_plus',razorpayPlanId:compatibleId,amount:199900,currency:'INR',billingInterval:'12 months'})},auditLog:{findFirst:async(q:any)=>q.where.entity==='subscription_plan_compatibility'?s.mapping?{metadata:{compatiblePlanId:compatibleId}}:null:q.where.action==='SUBSCRIPTION_CREATE_STARTED'?s.audits.filter((r:any)=>r.data.action==='SUBSCRIPTION_CREATE_STARTED').at(-1)?.data||null:s.audits.find((r:any)=>r.data.requestId===q.where.requestId&&q.where.action.in.includes(r.data.action))?.data||null,create:async(row:any)=>{s.audits.push(row);return row;}}};
 db.$transaction=(fn:any)=>{const run=serial.then(()=>fn(db));serial=run.catch(()=>undefined);return run;};
 const provider:any={plans:{fetch:async(id:string)=>id===sourceId?source:{...compatible,...(s.compatibleOverride||{})}},invoices:{all:async()=>({items:s.invoices})},payments:{all:async()=>({items:s.payments})},subscriptions:{fetch:async(id:string)=>id==='sub_old'?{...s.old}:({id:'sub_new',status:'created',plan_id:compatibleId}),cancel:async()=>{s.cancels++;if(s.raceActive)return {...s.old,status:'active',paid_count:1,current_start:1};s.old.status='cancelled';if(s.cancelTimeout)throw Error('Uncertain cancellation response');return {...s.old};},create:async(body:any)=>{assert.equal(body.plan_id,compatibleId);assert.equal(body.total_count,20);s.creates++;if(s.createError)throw s.createError;return {id:'sub_new',status:'created',plan_id:compatibleId};}}};
 (globalThis as any).subscriptionRecurrenceFixture={db,provider};mkdirSync('.cache',{recursive:true});
 await build({entryPoints:['lib/subscription-billing.ts'],outfile:'.cache/subscription-recurrence.cjs',bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^@\/lib\/(prisma|razorpay|growth|growth-partners)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.endsWith('prisma')?'exports.prisma=globalThis.subscriptionRecurrenceFixture.db;':a.path.endsWith('razorpay')?'exports.razorpay=globalThis.subscriptionRecurrenceFixture.provider;':'exports.recordGrowthEvent=exports.qualifyPartnerPayment=()=>{throw Error("No financial mutation expected")};'}));}}]});
 const {createProviderSubscription:create}=await import('../.cache/subscription-recurrence.cjs');
 await Promise.all([create(77,'yearly_plus'),create(77,'yearly_plus')]);assert.equal(s.creates,1);assert.equal(s.cancels,1);assert(s.audits.some((r:any)=>r.data.action==='SUBSCRIPTION_FAILED_MANDATE_RETIRED'));
 for(const status of ['active','authenticated','pending']){reset();s.old.status=status;await assert.rejects(create(77,'yearly_plus'));assert.equal(s.creates,0);assert.equal(s.cancels,0);}
 for(const status of ['authorized','captured','created']){reset();s.payments[0].status=status;await assert.rejects(create(77,'yearly_plus'));assert.equal(s.creates,0);assert.equal(s.cancels,0);}
 reset();s.payments[0].created_at=Math.floor(Date.now()/1000);await assert.rejects(create(77,'yearly_plus'));assert.equal(s.cancels,0);
 reset();s.localPayments=1;await assert.rejects(create(77,'yearly_plus'));assert.equal(s.cancels,0);
 reset();s.mapping=false;await assert.rejects(create(77,'yearly_plus'));assert.equal(s.creates,0);
 reset();s.compatibleOverride={interval:1};await assert.rejects(create(77,'yearly_plus'));assert.equal(s.creates,0);
 reset();s.raceActive=true;await assert.rejects(create(77,'yearly_plus'));assert.equal(s.creates,0,'Never create another mandate if authorisation raced with cancellation');
 reset();s.cancelTimeout=true;await assert.rejects(create(77,'yearly_plus'));assert.equal(s.creates,0);s.cancelTimeout=false;await create(77,'yearly_plus');assert.equal(s.creates,1,'Confirmed cancelled unpaid mandate can recover after ambiguous transport failure');
 reset();s.local=null;s.createError=Error('Unknown gateway response');await assert.rejects(create(77,'yearly_plus'));s.createError=null;await assert.rejects(create(77,'yearly_plus'),/earlier checkout/);assert.equal(s.creates,1,'An uncertain create cannot silently create another mandate');
 reset();s.local=null;await create(77,'yearly_plus');assert.equal(s.creates,1);assert.equal(s.cancels,0);
 console.log('PASS annual recurrence: exact annual price/cadence, trusted plan mapping, safe failed-mandate recovery, serialized retries, active/authorized/captured/in-flight protection, missing mappings, malformed plans and ambiguous cancellation. No real gateway or customer contacted.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
