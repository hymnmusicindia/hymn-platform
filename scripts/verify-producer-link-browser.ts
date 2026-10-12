import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

async function main() {
  mkdirSync(".cache",{recursive:true});
  writeFileSync(".cache/producer-link-entry.tsx",`import React from 'react';import {createRoot} from 'react-dom/client';import {ProducerLinkPage} from '../components/producer-link-page';createRoot(document.getElementById('app')!).render(<ProducerLinkPage {...(window as any).fixture}/>);`);
  await build({entryPoints:[".cache/producer-link-entry.tsx"],outfile:".cache/producer-link-browser.js",bundle:true,platform:"browser",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"',"process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID":'"fixture-google"'},plugins:[{name:"next-link-adapter",setup(builder){
    builder.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:"fixture"}));
    builder.onLoad({filter:/.*/,namespace:"fixture"},(args)=>({loader:"tsx",resolveDir:process.cwd(),contents:args.path==="next/navigation"?`export function useRouter(){return {push(){throw new Error("Bio login must not redirect")},refresh(){}}}`:`import React from 'react';export default function Link(props:any){return <a {...props}/>} `}));
  }}]});
  const utilities=await postcss([tailwindcss({content:["./components/producer-link-page.tsx"],theme:{extend:{}},plugins:[]})]).process("@tailwind base;@tailwind components;@tailwind utilities;",{from:undefined});
  const globals=[...readFileSync("app/layout.tsx","utf8").matchAll(/import "(\.\/[^\"]+\.css)"/g)].map(match=>"app/"+match[1].slice(2));
  const css=utilities.css+globals.map(file=>readFileSync(file,"utf8")).join("\n")+readFileSync(".cache/producer-link-browser.css","utf8");
  const image="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g"><stop stop-color="#754e74"/><stop offset="1" stop-color="#293b59"/></linearGradient></defs><path fill="url(#g)" d="M0 0h600v600H0z"/></svg>');
  const fixture={name:"Aditya Ujjain",slug:"aditya-ujjain-18",bio:"Beats for your next chapter.",avatar:image,banner:image,beats:Array.from({length:6},(_,index)=>({id:index+1,title:`Beat ${index+1}`,bpm:120,genre:"Trap",artwork:image,audio:"https://producer.fixture/audio.wav"})),socials:[{id:"instagram",label:"Instagram",url:"https://instagram.com/producer"},{id:"youtube",label:"YouTube",url:"https://youtube.com/@producer"},{id:"spotify",label:"Spotify",url:"https://open.spotify.com/artist/test"},{id:"website",label:"Website",url:"https://example.com"}]};
  const wav=Buffer.alloc(44+32000*4);wav.write("RIFF");wav.writeUInt32LE(wav.length-8,4);wav.write("WAVEfmt ",8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write("data",36);wav.writeUInt32LE(wav.length-44,40);
  const browser=await chromium.launch({headless:true});
  try { for(const {width,count} of [{width:320,count:6},{width:390,count:6},{width:430,count:6},{width:1440,count:6},{width:390,count:0},{width:390,count:1}]) {
    const context=await browser.newContext({viewport:{width,height:900},permissions:["clipboard-read","clipboard-write"]});const page=await context.newPage();const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
    await page.route("https://producer.fixture/**",route=>route.fulfill(route.request().url().endsWith("hymnlogowhite.png")?{contentType:"image/png",body:readFileSync("public/assets/hymnlogowhite.png")}:route.request().url().endsWith("audio.wav")?{contentType:"audio/wav",body:wav}:{contentType:"text/html",body:'<html data-theme="light"><body><div id="app"></div></body></html>'}));
    await page.goto("https://producer.fixture/p/aditya-ujjain-18");await page.evaluate(value=>{(window as any).fixture=value;},{...fixture,beats:fixture.beats.slice(0,count),socials:count ? fixture.socials : []});await page.addStyleTag({content:css});await page.addScriptTag({content:readFileSync(".cache/producer-link-browser.js","utf8")});
    await page.getByRole("heading",{name:fixture.name,exact:true}).waitFor();
    assert.equal(await page.getByRole("slider",{name:/^Play Beat/}).count(),count);
    assert.equal(await page.getByLabel("Open Aditya Ujjain's beat store").getAttribute("href"),"/beat-store/producers/aditya-ujjain-18");
    if(count) assert.equal(await page.getByRole("link",{name:"Instagram",exact:true}).getAttribute("rel"),"noopener noreferrer");
    assert.equal(await page.getByRole("img",{name:"HYMN Music",exact:true}).count(),1);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"No horizontal overflow");
    for(const button of await page.getByRole("button").all()){const bounds=await button.boundingBox();assert(bounds&&bounds.height>=44,"Touch target height");}
    if(count) { await page.getByLabel("Play Beat 1",{exact:true}).click();await page.getByLabel("Pause Beat 1",{exact:true}).waitFor();assert.equal(await page.locator('input[type="range"]').count(),0,"No playback bar");
    await page.waitForFunction(()=>Number(document.querySelector('[role="slider"]')?.getAttribute('aria-valuemax'))>0);
    await page.getByLabel("Pause Beat 1",{exact:true}).click();
    // A complete local WAV keeps seeking independent of the mocked HTTP range server.
    await page.evaluate(base64=>{const audio=document.querySelector("audio")!;const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));audio.preload="auto";audio.src=URL.createObjectURL(new Blob([bytes],{type:"audio/wav"}));audio.load();},wav.toString("base64"));
    await page.waitForFunction(()=>document.querySelector("audio")!.readyState>=3);
    await page.getByRole("slider").first().press("End");
    await page.waitForFunction(()=>document.querySelector("audio")!.currentTime>=3.9);
    await page.getByRole("slider").first().press("Home");
    const wheel=page.getByRole("slider").first();const bounds=await wheel.boundingBox();assert(bounds);
    const cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2,r=bounds.width*.4;
    await page.mouse.move(cx,cy-r);await page.mouse.down();
    for(let step=1;step<=5;step++){const angle=-Math.PI/2+step*Math.PI/50;await page.mouse.move(cx+Math.cos(angle)*r,cy+Math.sin(angle)*r);}
    await page.mouse.up();
    await page.waitForFunction(()=>document.querySelector("audio")!.currentTime>0.5);
    assert(await page.locator("audio").evaluate((a:HTMLAudioElement)=>a.paused),"Dragging does not toggle playback");
    await page.mouse.move(cx+r,cy);await page.mouse.down();
    for(let step=1;step<=10;step++){const angle=-step*Math.PI/50;await page.mouse.move(cx+Math.cos(angle)*r,cy+Math.sin(angle)*r);}
    await page.mouse.up();
    await page.waitForFunction(()=>document.querySelector("audio")!.currentTime<0.5);
    if(count>1) { await page.getByLabel("Play Beat 2",{exact:true}).click();await page.getByLabel("Pause Beat 2",{exact:true}).waitFor();assert.equal(await page.locator("audio").count(),1,"Only one player");
    await page.getByLabel("Pause Beat 2",{exact:true}).click();await page.getByLabel("Play Beat 2",{exact:true}).waitFor(); } }
    await page.getByLabel("Share Aditya Ujjain's profile").click();await page.getByRole("status").filter({hasText:"Link copied"}).waitFor();
    assert(await page.getByRole("img",{name:"HYMN Music",exact:true}).evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0),"Real HYMN logo loads");
    assert.deepEqual(errors,[]);await page.screenshot({path:`.cache/producer-bio-${width}-${count}.png`,fullPage:true});await context.close();
  }
  for(const purchaseWidth of [320,390]) {
  const context=await browser.newContext({viewport:{width:purchaseWidth,height:900}});const page=await context.newPage();const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  const viewer={name:"Quick Buyer",email:"buyer@example.com",avatarUrl:image};let authenticated=false;let orders=0;let verifications=0;let releases=0;
  const profile:any={...fixture,totalBeats:8,beats:fixture.beats.map(beat=>({...beat,price:120,generalPrice:250,stemPrice:500,exclusivePrice:5000}))};
  const quote=(items:any[])=>({finalAmount:items.reduce((sum,item)=>sum+(item.licenseType==="wav"?250:120),0),lineItems:items.map(item=>({label:`Beat ${item.beatId}`,description:item.licenseType.toUpperCase()+" licence",total:item.licenseType==="wav"?250:120}))});
  await page.route("https://accounts.google.com/gsi/client",route=>route.fulfill({contentType:"application/javascript",body:`window.google={accounts:{id:{initialize(options){window.fixtureGoogleCallback=options.callback},disableAutoSelect(){},renderButton(host){const b=document.createElement('button');b.textContent='Continue with Google';b.onclick=()=>window.fixtureGoogleCallback({credential:'fixture_google_credential'});host.appendChild(b)},prompt(){}}}};`}));
  await page.route("https://checkout.razorpay.com/v1/checkout.js",route=>route.fulfill({contentType:"application/javascript",body:`window.Razorpay=class{constructor(options){window.fixtureCheckout=options}on(event,handler){window.fixtureGatewayEvents=window.fixtureGatewayEvents||{};window.fixtureGatewayEvents[event]=handler}open(){window.fixtureCheckoutOpen=true}};`}));
  await page.route("https://producer.fixture/**",async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/api/auth/google"){assert.equal(route.request().postDataJSON().credential,"fixture_google_credential");authenticated=true;return route.fulfill({json:{user:viewer,redirectPath:"/dashboard"}});}
    if(url.pathname==="/api/producer-bio/session")return route.fulfill({json:{user:authenticated?viewer:null}});
    if(url.pathname.endsWith("/beats"))return route.fulfill({json:{beats:[7,8].map(id=>({...profile.beats[0],id,title:`Beat ${id}`})),total:8}});
    if(url.pathname==="/api/checkout/quote"){assert(authenticated,"Quotes require login");return route.fulfill({json:{quote:quote(route.request().postDataJSON().items)}});}
    if(url.pathname==="/api/checkout/create-order"){assert(authenticated);orders++;const body=route.request().postDataJSON();assert.equal(body.amount,undefined,"Client never sets the charged amount");return route.fulfill({json:{requiresPayment:true,key:"fixture",orderId:`order_${orders}`,amount:quote(body.items).finalAmount*100,currency:"INR"}});}
    if(url.pathname==="/api/checkout/release-reservation"){releases++;assert.equal(route.request().postDataJSON().orderId,"order_3");return route.fulfill({json:{released:true}});}
    if(url.pathname==="/api/checkout/verify-payment"){verifications++;if(verifications===3){authenticated=false;return route.fulfill({status:401,json:{error:"Unauthorized."}});}return route.fulfill(verifications===1?{status:400,json:{error:"Razorpay payment has not been captured."}}:{json:{success:true,delivery:{email:viewer.email,status:verifications===2?"sent":"pending"}}});}
    if(url.pathname.endsWith("hymnlogowhite.png"))return route.fulfill({contentType:"image/png",body:readFileSync("public/assets/hymnlogowhite.png")});
    if(url.pathname.endsWith("audio.wav"))return route.fulfill({contentType:"audio/wav",body:wav});
    return route.fulfill({contentType:"text/html",body:'<html data-theme="light"><body><div id="app"></div></body></html>'});
  });
  async function render(){await page.goto("https://producer.fixture/p/aditya-ujjain-18");await page.evaluate(value=>{(window as any).fixture=value;},profile);await page.addStyleTag({content:css});await page.addScriptTag({content:readFileSync(".cache/producer-link-browser.js","utf8")});await page.getByRole("heading",{name:profile.name,exact:true}).waitFor();}
  await render();
  await page.getByRole("button",{name:"Load more beats",exact:true}).click();await page.getByLabel("Play Beat 8",{exact:true}).waitFor();assert.equal(authenticated,false,"Loading more beats is public");
  await page.getByLabel("Add Beat 1 to cart",{exact:true}).click();await page.getByRole("dialog",{name:"Quick Google sign-in"}).waitFor();await page.getByLabel("Close purchase dialog").click();assert.equal(authenticated,false);assert.equal(await page.evaluate(()=>localStorage.getItem("hymn-beat-cart")),null);
  await page.getByLabel("Add Beat 1 to cart",{exact:true}).click();await page.getByRole("button",{name:"Continue with Google",exact:true}).click();await page.getByLabel("Quick Buyer's purchases").waitFor();await page.getByLabel("Open cart, 1 beats").waitFor();assert.equal(new URL(page.url()).pathname,"/p/aditya-ujjain-18");assert.equal(orders,0,"Login/add to cart does not create a charge");
  await page.getByLabel("Instant buy Beat 2",{exact:true}).click();await page.getByRole("radio",{name:/WAV/}).click();await page.getByRole("button",{name:"Pay \u20b9250",exact:true}).waitFor();await page.screenshot({path:`.cache/bio-instant-checkout-${purchaseWidth}.png`,fullPage:true});
  await page.getByRole("button",{name:"Pay \u20b9250",exact:true}).click();await page.waitForFunction(()=>(window as any).fixtureCheckoutOpen===true);assert.equal(await page.locator("dialog[open]").count(),0,"Native dialog closes before Razorpay opens");assert.equal(await page.evaluate(()=>(window as any).fixtureCheckout.prefill.email),viewer.email);
  await page.evaluate(()=>(window as any).fixtureGatewayEvents["payment.failed"]({error:{description:"Try a different payment method"}}));assert.equal(await page.locator("dialog[open]").count(),0,"Razorpay retry UI stays unobstructed");
  await page.evaluate(()=>(window as any).fixtureCheckout.handler({razorpay_order_id:"order_1",razorpay_payment_id:"pay_fixture",razorpay_signature:"signed"}));await page.getByRole("button",{name:"Check payment",exact:true}).waitFor();assert.equal(orders,1);assert.equal(await page.getByText(/Files and licence sent/).count(),0);
  await page.reload();profile.initialViewer=viewer;await page.evaluate(value=>{(window as any).fixture=value;},profile);await page.addStyleTag({content:css});await page.addScriptTag({content:readFileSync(".cache/producer-link-browser.js","utf8")});await page.getByRole("button",{name:"Check payment",exact:true}).waitFor();await page.getByRole("button",{name:"Check payment",exact:true}).click();await page.getByText("Files and licence sent to buyer@example.com.",{exact:true}).waitFor();assert.equal(orders,1,"Confirmation retry never charges again");
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("hymn-beat-cart")||"[]").length),1,"Instant buy preserves unrelated cart beats");await page.getByLabel("Close purchase dialog").click();await page.getByLabel("Open cart, 1 beats").click();await page.getByRole("button",{name:"Pay \u20b9120",exact:true}).click();await page.waitForFunction(()=>(window as any).fixtureCheckout?.order_id==="order_2");await page.evaluate(()=>(window as any).fixtureCheckout.handler({razorpay_order_id:"order_2",razorpay_payment_id:"pay_second",razorpay_signature:"signed"}));await page.getByRole("dialog",{name:"Quick Google sign-in"}).waitFor();await page.getByRole("button",{name:"Continue with Google",exact:true}).click();await page.getByRole("button",{name:"Check payment",exact:true}).click();assert.equal(orders,2,"Expired sign-in confirms the existing payment");await page.getByText(/Email delivery to buyer@example.com is pending/).waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("hymn-beat-cart")||"[]").length),0);assert.equal(releases,0,"Paid and unconfirmed payments never request reservation release");
  await page.getByLabel("Close purchase dialog").click();
  await page.getByLabel("Instant buy Beat 2",{exact:true}).click();
  await page.getByRole("radio",{name:/EXCLUSIVE/}).click();
  await page.getByRole("button",{name:/^Pay /}).click();
  await page.waitForFunction(()=>(window as any).fixtureCheckout?.order_id==="order_3");
  const releasedResponse=page.waitForResponse(response=>response.url().endsWith("/api/checkout/release-reservation"));
  await page.evaluate(()=>(window as any).fixtureCheckout.modal.ondismiss());
  await releasedResponse;
  assert.equal(releases,1,"Dismissed unpaid exclusive checkout releases its hold");
  assert.deepEqual(errors,[]);await context.close();
  }
  console.log("PASS real Google callback, public load more, login/cart resume, avatar, licence pricing, instant/cart checkout, capture retry after refresh and honest email receipts; mocked gateway only");
  console.log("PASS mobile-first producer bio page at 320/390/430/1440: playback, switching, sharing, links and touch targets"); } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
