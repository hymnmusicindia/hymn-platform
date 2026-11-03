import {prisma} from '../lib/prisma';
import {razorpay} from '../lib/razorpay';
import {SUBSCRIPTION_POLICIES,isSubscriptionProduct} from '../lib/subscription-billing';
import {ANNUAL_RECURRENCE_PROFILE,annualCompatibilityRequired,validateCompatibleAnnualPlan} from '../lib/subscription-recurrence';
import {validateSubscriptionProviderPlan} from '../lib/subscription-plan-validation';

async function main(){
 const product=process.argv.find(a=>a.startsWith('--product='))?.slice(10),sourceId=process.argv.find(a=>a.startsWith('--source-plan='))?.slice(14);
 if(!isSubscriptionProduct(product)||product==='half_yearly'||!sourceId?.startsWith('plan_')||!razorpay)throw Error('Supply an annual --product and verified --source-plan ID. --apply registers the compatible plan; it creates no subscription or payment.');
 const policy=SUBSCRIPTION_POLICIES[product],source=await razorpay.plans.fetch(sourceId);
 validateSubscriptionProviderPlan(source,{...policy,months:12});
 if(!annualCompatibilityRequired(source))return console.log(JSON.stringify({product,alreadyCompatible:true}));
 const prior=await prisma.auditLog.findFirst({where:{entity:'subscription_plan_compatibility',entityId:sourceId,action:'SUBSCRIPTION_PLAN_COMPATIBILITY_REGISTERED'},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{metadata:true}});
 let id=(prior?.metadata as {compatiblePlanId?:string}|null)?.compatiblePlanId;
 let compatible=id?await razorpay.plans.fetch(id):null;
 if(compatible)validateCompatibleAnnualPlan(compatible,sourceId,{...policy,months:12});
 if(!process.argv.includes('--apply'))return console.log(JSON.stringify({product,sourceId,amount:policy.amount,period:'monthly',interval:12,registeredPlan:id||null}));
 if(!compatible){
   // Discover an orphan plan if registration was interrupted after provider creation.
   for(let skip=0;skip<1000&&!compatible;skip+=100){const page=await razorpay.plans.all({count:100,skip});compatible=page.items.find(p=>p.notes?.hymn_source_plan_id===sourceId&&p.notes?.hymn_recurrence_profile===ANNUAL_RECURRENCE_PROFILE)||null;if(page.items.length<100)break;}
   if(!compatible)compatible=await razorpay.plans.create({period:'monthly',interval:12,item:{name:`HYMN ${policy.name}`,amount:policy.amount,currency:policy.currency,description:'Annual subscription billed once every 12 months.'},notes:{hymn_source_plan_id:sourceId,hymn_product:product,hymn_recurrence_profile:ANNUAL_RECURRENCE_PROFILE}});
   validateCompatibleAnnualPlan(compatible,sourceId,{...policy,months:12});
   const plan=compatible;
   await prisma.$transaction(async tx=>{
     await tx.$queryRaw`SELECT id FROM subscription_plan_versions WHERE razorpay_plan_id = ${sourceId} FOR UPDATE`;
     await tx.subscriptionPlanVersion.upsert({where:{razorpayPlanId:plan.id},create:{product,razorpayPlanId:plan.id,amount:policy.amount,currency:policy.currency,billingInterval:policy.billingInterval},update:{}});
     await tx.auditLog.create({data:{action:'SUBSCRIPTION_PLAN_COMPATIBILITY_REGISTERED',entity:'subscription_plan_compatibility',entityId:sourceId,metadata:{product,sourcePlanId:sourceId,compatiblePlanId:plan.id,amount:policy.amount,currency:policy.currency,months:12,profile:ANNUAL_RECURRENCE_PROFILE}}});
   });
 }
 console.log(JSON.stringify({product,sourceId,compatiblePlanId:compatible.id,amount:policy.amount,period:compatible.period,interval:compatible.interval,subscriptionCreated:false}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Plan registration failed');process.exitCode=1;}).finally(()=>prisma.$disconnect());
