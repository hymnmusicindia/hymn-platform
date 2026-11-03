import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {prisma} from '../lib/prisma';
import {ANNUAL_RECURRENCE_PROFILE} from '../lib/subscription-recurrence';

async function main(){
 assert.equal(process.env.DATABASE_URL,'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
 process.env.RAZORPAY_PLAN_YEARLY_PLUS='plan_fixture_source';
 let creates=0,uncertain=false;const pending=new Map<string,any>();
 const gateway={plans:{fetch:async(id:string)=>({id,period:id==='plan_fixture_source'?'yearly':'monthly',interval:id==='plan_fixture_source'?1:12,item:{amount:199900,currency:'INR'},notes:{hymn_source_plan_id:'plan_fixture_source',hymn_recurrence_profile:ANNUAL_RECURRENCE_PROFILE}})},subscriptions:{fetch:async(id:string)=>pending.get(id),create:async(body:any)=>{creates++;if(uncertain)throw Error('Unknown provider response');const row={id:`sub_fixture_${creates}`,plan_id:body.plan_id,status:'created'};pending.set(row.id,row);return row;}}};
 (globalThis as any).subscriptionDbGateway=gateway;
 await prisma.auditLog.create({data:{action:'SUBSCRIPTION_PLAN_COMPATIBILITY_REGISTERED',entity:'subscription_plan_compatibility',entityId:'plan_fixture_source',metadata:{compatiblePlanId:'plan_fixture_compatible'}}});
 await build({entryPoints:['lib/subscription-billing.ts'],outfile:'.cache/subscription-recurrence-db.cjs',bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'gateway-fixture',setup(b){b.onResolve({filter:/^@\/lib\/(razorpay|growth|growth-partners)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.endsWith('razorpay')?'exports.razorpay=globalThis.subscriptionDbGateway;':'exports.recordGrowthEvent=exports.qualifyPartnerPayment=()=>{throw Error("No fulfilment expected")};'}));}}]});
 const {createProviderSubscription:create,synchronizeProviderSubscription:sync}=await import('../.cache/subscription-recurrence-db.cjs');
 async function customer(){return prisma.user.create({data:{email:`${randomUUID()}@subscription.fixture.invalid`,googleId:randomUUID(),name:'Subscription fixture'}});}
 const user=await customer();const both=await Promise.all([create(user.id,'yearly_plus'),create(user.id,'yearly_plus')]);assert.equal(creates,1);assert.equal(both[0].provider.id,both[1].provider.id);assert.equal(await prisma.subscription.count({where:{userId:user.id}}),1);
 assert.equal(await prisma.auditLog.count({where:{entity:'subscription_checkout_attempt',entityId:String(user.id),action:'SUBSCRIPTION_CREATE_COMMITTED'}}),1);
 const saved=await prisma.subscription.findUniqueOrThrow({where:{userId:user.id}});
 await prisma.auditLog.create({data:{action:'SUBSCRIPTION_FAILED_MANDATE_RETIRED',entity:'subscriptions',entityId:String(saved.id),metadata:{providerId:'sub_retired_fixture'}}});
 assert.equal((await sync({id:'sub_retired_fixture',status:'cancelled'})).razorpaySubscriptionId,saved.razorpaySubscriptionId);
 assert.equal((await prisma.subscription.findUniqueOrThrow({where:{id:saved.id}})).status,'created','Delayed old cancellation must not change the replacement');
 await assert.rejects(sync({id:'sub_retired_fixture',status:'active'},{id:'pay_unexpected',status:'captured'}),/not linked/,'Unexpected money on a retired ID requires review rather than crediting another mandate');
 const failed=await customer();uncertain=true;await assert.rejects(create(failed.id,'yearly_plus'),/Unknown provider/);assert.equal(await prisma.subscription.count({where:{userId:failed.id}}),0);
 const before=creates;uncertain=false;await assert.rejects(create(failed.id,'yearly_plus'),/earlier checkout/);assert.equal(creates,before);assert.equal(await prisma.auditLog.count({where:{entity:'subscription_checkout_attempt',entityId:String(failed.id),action:'SUBSCRIPTION_CREATE_STARTED'}}),1,'Independent intent survives transaction rollback');
 console.log('PASS real PostgreSQL subscription locking: concurrent checkouts create one mandate; rolled-back uncertain requests retain durable evidence and block duplicate creation. Fake gateway only.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
