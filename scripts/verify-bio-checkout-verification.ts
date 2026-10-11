import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync(".cache",{recursive:true});
  process.env.RAZORPAY_KEY_ID="fixture_key";process.env.RAZORPAY_KEY_SECRET="fixture_secret";
  await build({entryPoints:["app/api/checkout/verify-payment/route.ts"],outfile:".cache/bio-verification.cjs",bundle:true,platform:"node",format:"cjs",packages:"external",plugins:[{name:"verification-adapters",setup(builder){
    builder.onResolve({filter:/^(@\/lib\/(db|session|prisma|payment-webhooks|rate-limit)|razorpay)$/},args=>({path:args.path,namespace:"fixture"}));
    builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:args.path==="razorpay"?`module.exports=class {constructor(){this.payments={fetch:async()=>{globalThis.fixture.calls.push('provider');return globalThis.fixture.payment}}}}`:args.path.endsWith("session")?`exports.getSession=async()=>globalThis.fixture.session`:args.path.endsWith("rate-limit")?`exports.consumeRateLimit=async()=>({allowed:true})`:args.path.endsWith("db")?`exports.getCheckoutOrderByRazorpayId=async()=>globalThis.fixture.order`:args.path.endsWith("payment-webhooks")?`exports.confirmCheckoutPayment=async()=>{globalThis.fixture.calls.push('fulfil');return globalThis.fixture.order}`:`exports.prisma={beatPurchase:{findMany:async()=>[{id:42}]},emailLog:{findMany:async()=>{globalThis.fixture.calls.push('delivery');return globalThis.fixture.logs}}}` }));
  }}]});
  const modulePath="../.cache/bio-verification.cjs";const {POST}=await import(modulePath);
  const state=globalThis as typeof globalThis&{fixture:any};
  const payment={razorpay_order_id:"order_fixture",razorpay_payment_id:"pay_fixture",razorpay_signature:createHmac("sha256","fixture_secret").update("order_fixture|pay_fixture").digest("hex")};
  function reset(){state.fixture={session:{sub:18,email:"buyer@example.com"},order:{id:7,userId:18,finalAmount:120,paymentStatus:"paid"},payment:{order_id:"order_fixture",amount:12000,currency:"INR",status:"captured"},logs:[{status:"sent"}],calls:[]};}
  const request=(body=payment)=>POST(new Request("http://localhost/api/checkout/verify-payment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}));
  reset();let response=await request();assert.equal(response.status,200);let data=await response.json();assert.equal(data.delivery.status,"sent");assert.deepEqual(state.fixture.calls,["provider","fulfil","delivery"]);
  for(const patch of [{status:"authorized"},{amount:1},{currency:"USD"},{order_id:"different"}]){reset();Object.assign(state.fixture.payment,patch);response=await request();assert.equal(response.status,400);assert.deepEqual(state.fixture.calls,["provider"],"Uncaptured/mismatched payments never fulfil or deliver");}
  reset();response=await request({...payment,razorpay_signature:"bad"});assert.equal(response.status,400);assert.deepEqual(state.fixture.calls,[]);
  reset();state.fixture.order.userId=99;response=await request();assert.equal(response.status,404);assert.deepEqual(state.fixture.calls,[]);
  reset();state.fixture.session=null;assert.equal((await request()).status,401);
  reset();state.fixture.logs=[{status:"failed"}];data=await (await request()).json();assert.equal(data.success,true);assert.equal(data.delivery.status,"pending","Email failure does not lose the paid purchase or falsely claim delivery");
  console.log("PASS server signature, ownership, captured amount/currency/order gates and honest email delivery status; no live charges");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
