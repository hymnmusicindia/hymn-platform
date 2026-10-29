"use client";
import {BeatBuyerFields,emptyBeatBuyer} from "./beat-buyer-fields";
import {beatBuyerDetailsSchema} from "@/lib/beat-buyer-details";
import Link from "next/link";
import { Check, Loader2, Mail, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { beatLicensePrice, type BeatStoreLicenseType } from "@/lib/beat-store";
import { parseBioCart, readBioCart, type BioCartItem } from "@/lib/bio-cart";
import { loadBioRazorpay } from "@/lib/client-razorpay";
import { cancelUnpaidCheckout } from "@/lib/client-checkout-reservation";
import type { BioBeat, BioViewer } from "@/lib/producer-links";
import s from "./producer-bio-purchase.module.css";

type Quote = { finalAmount:number; lineItems:Array<{label:string;description:string;total:number;usageTerms?:Array<{label:string;value:string}>;licenceClauses?:Array<{title:string;body:string}>}> };
type Payment = {razorpay_order_id:string;razorpay_payment_id:string;razorpay_signature:string};
const money=(amount:number)=>`\u20b9${amount.toLocaleString("en-IN")}`;

export function useProducerBioPurchase(initialViewer: BioViewer | null) {
  const [viewer,setViewer]=useState(initialViewer);
  const [cart,setCart]=useState<BioCartItem[]>([]);
  const [panel,setPanel]=useState<"login"|"checkout"|"success"|null>(null);
  const [pending,setPending]=useState<{action:"cart"|"buy"|"checkout";beat?:BioBeat;licence?:BeatStoreLicenseType}|null>(null);
  const [buyBeat,setBuyBeat]=useState<BioBeat|null>(null);
  const [licence,setLicence]=useState<BeatStoreLicenseType>("mp3");
  const [items,setItems]=useState<BioCartItem[]>([]);
  const [quote,setQuote]=useState<Quote|null>(null);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [paidEmail,setPaidEmail]=useState("");
  const [deliverySent,setDeliverySent]=useState(false);
  const [unconfirmed,setUnconfirmed]=useState<Payment|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  const paying=useRef(false);
  const verifying=useRef(false);
  const checkedItems=useRef<BioCartItem[]>([]);

  useEffect(()=>{const sync=()=>setCart(readBioCart());sync();window.addEventListener("hymn-cart-updated",sync);window.addEventListener("storage",sync);return()=>{window.removeEventListener("hymn-cart-updated",sync);window.removeEventListener("storage",sync);};},[]);
  useEffect(()=>{if(panel&&!dialog.current?.open)dialog.current?.showModal();else if(!panel&&dialog.current?.open)dialog.current.close();},[panel]);
  useEffect(()=>{
    if(!viewer)return;
    try {
      const saved=JSON.parse(sessionStorage.getItem("hymn-bio-payment")||"null");
      if(saved?.email!==viewer.email||!saved.payment||!["razorpay_order_id","razorpay_payment_id","razorpay_signature"].every(key=>typeof saved.payment[key]==="string"))return;
      const savedItems=parseBioCart(JSON.stringify(saved.items));if(!savedItems.length)return;
      checkedItems.current=savedItems;setItems(savedItems);setBuyBeat(null);setUnconfirmed(saved.payment);setPanel("checkout");
    }catch{/* Browser storage can be unavailable; webhooks still fulfil captured payments. */}
  },[viewer]);

  function writeCart(next:BioCartItem[]) {
    try {localStorage.setItem("hymn-beat-cart",JSON.stringify(next));setCart(next);window.dispatchEvent(new CustomEvent("hymn-cart-updated",{detail:{items:next}}));}
    catch {setError("Your browser could not save the cart. Use Instant buy instead.");}
  }
  function proceed(action:"cart"|"buy",beat:BioBeat,selectedLicence:BeatStoreLicenseType="mp3") {
    const supported=(["mp3","wav","stems","exclusive"] as BeatStoreLicenseType[]).filter(type=>beatLicensePrice(beat,type)>0);
    if(!supported.length){setError("The producer has not supplied a purchasable file yet.");return;}
    if(!supported.includes(selectedLicence))selectedLicence=supported[0];
    setError("");setMessage("");
    if(action==="cart") {const current=readBioCart();const exists=current.some(item=>item.beatId===beat.id);writeCart(exists?current.filter(item=>item.beatId!==beat.id):[...current,{beatId:beat.id,licenseType:selectedLicence,price:beatLicensePrice(beat,selectedLicence)}]);setMessage(`${beat.title} ${exists?"removed from":"added to"} cart`);setPanel(null);}
    else {setBuyBeat(beat);setLicence(selectedLicence);setItems([{beatId:beat.id,licenseType:selectedLicence}]);setPanel("checkout");}
  }
  function request(action:"cart"|"buy",beat:BioBeat) {
    if(paying.current)return;
    if(unconfirmed){setPanel("checkout");return;}
    if(!viewer){setPending({action,beat});setPanel("login");return;}
    proceed(action,beat);
  }
  function openCart() {
    if(paying.current)return;
    if(unconfirmed){setPanel("checkout");return;}
    if(!viewer) {setPending({action:"checkout"});setPanel("login");return;}
    setError("");setBuyBeat(null);setItems(cart);setPanel("checkout");
  }
  async function authenticated() {
    const response=await fetch("/api/producer-bio/session",{cache:"no-store"});
    const data=await response.json();
    if(!response.ok||!data.user)throw new Error("Could not finish sign-in. Try again.");
    setViewer(data.user);
    if(pending){const intent=pending;setPending(null);if(intent.action==="checkout"){setBuyBeat(null);setItems(readBioCart());setPanel("checkout");}else if(intent.beat)proceed(intent.action,intent.beat,intent.licence);}
    else {setPanel(null);setMessage("Signed in. Choose a beat to continue.");}
  }

  useEffect(()=>{
    if(panel!=="checkout"||!items.length||unconfirmed)return;
    let active=true;const controller=new AbortController();setQuote(null);setLoading(true);setError("");
    fetch("/api/checkout/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:items.map(item=>({type:"beat",beatId:item.beatId,licenseType:item.licenseType})),useReferralCredits:false}),signal:controller.signal}).then(async response=>{
      const data=await response.json();if(response.status===401){if(active){setViewer(null);setPending(buyBeat?{action:"buy",beat:buyBeat,licence}:{action:"checkout"});setPanel("login");}return;}
      if(!response.ok)throw new Error(data.error||"This beat is no longer available.");if(active)setQuote(data.quote);
    }).catch(error=>{if(active&&error.name!=="AbortError")setError(error.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[panel,items,unconfirmed,buyBeat,licence]);

  async function confirm(payment:Payment) {
    if(verifying.current)return;verifying.current=true;
    setBusy(true);paying.current=true;setError("");
    try {sessionStorage.setItem("hymn-bio-payment",JSON.stringify({email:viewer?.email,payment,items:checkedItems.current}));}catch{/* Payment confirmation does not depend on browser storage. */}
    try {
      const response=await fetch("/api/checkout/verify-payment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payment)});
      const data=await response.json();
      if(response.status===401){setUnconfirmed(payment);setViewer(null);setPending({action:"checkout"});setPanel("login");return;}
      if(!response.ok||!data.success)throw new Error(data.error||"Payment confirmation is pending. Please check again.");
      const purchased=new Map(checkedItems.current.map(item=>[item.beatId,item.licenseType]));
      writeCart(readBioCart().filter(item=>purchased.get(item.beatId)!==item.licenseType));
      try {sessionStorage.removeItem("hymn-bio-payment");}catch{/* No effect on the completed purchase. */}
      setUnconfirmed(null);setPaidEmail(data.delivery?.email||viewer?.email||"");setDeliverySent(data.delivery?.status==="sent");setPanel("success");
    } catch(error) {setUnconfirmed(payment);setError(`${error instanceof Error?error.message:"Confirmation pending."} Do not pay again; use Check payment.`);setPanel("checkout");}
    finally {setBusy(false);paying.current=false;verifying.current=false;}
  }
  const [buyerDetails,setBuyerDetails]=useState(emptyBeatBuyer);
  useEffect(()=>{setBuyerDetails(value=>({...value,acceptedTerms:false}));},[items]);
  async function pay() {
    if(paying.current)return;
    if(unconfirmed){await confirm(unconfirmed);return;}
    if(!viewer||!quote||!items.length)return;
    const buyer=beatBuyerDetailsSchema.safeParse(buyerDetails);if(!buyer.success){setError(buyer.error.issues[0].message);return;}
    paying.current=true;setBusy(true);setError("");checkedItems.current=[...items];
    let createdOrderId:string|null=null;
    try {
      const response=await fetch("/api/checkout/create-order",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:items.map(item=>({type:"beat",beatId:item.beatId,licenseType:item.licenseType})),useReferralCredits:false,buyerDetails:buyer.data})});
      const data=await response.json();
      if(response.status===401){setViewer(null);setPending(buyBeat?{action:"buy",beat:buyBeat,licence}:{action:"checkout"});setPanel("login");throw new Error("Please sign in again to continue.");}
      if(!response.ok)throw new Error(data.error||"Could not start checkout.");
      if(!data.requiresPayment)throw new Error("This checkout needs a paid order.");
      createdOrderId=data.orderId;
      await loadBioRazorpay();if(!window.Razorpay)throw new Error("Payment checkout is unavailable.");
      // Native modal must close before Razorpay opens its own payment dialog.
      dialog.current?.close();setPanel(null);
      let failed=false;let returned=false;
      const checkout=new window.Razorpay({key:data.key,order_id:data.orderId,amount:data.amount,currency:data.currency,name:"HYMN Music",description:buyBeat?.title||"Beat licences",prefill:{name:buyer.data.legalName,email:viewer.email,contact:buyer.data.phone},handler:(payment:Payment)=>{returned=true;setUnconfirmed(payment);void confirm(payment);},modal:{ondismiss:()=>{if(!returned&&!verifying.current){void cancelUnpaidCheckout(data.orderId).finally(()=>{paying.current=false;setBusy(false);if(failed)setPanel("checkout");});}}}});
      // Keep Razorpay's retry UI usable; show our error sheet only after it closes.
      checkout.on("payment.failed",event=>{failed=true;setError(event.error?.description||"Payment failed. No beat has been purchased.");});checkout.open();
    } catch(error){if(createdOrderId)await cancelUnpaidCheckout(createdOrderId);setError(error instanceof Error?error.message:"Checkout failed.");setBusy(false);paying.current=false;}
  }

  const sheet=<dialog ref={dialog} className={s.dialog} onCancel={()=>setPanel(null)} onClose={()=>setPanel(null)} aria-label={panel==="login"?"Quick Google sign-in":panel==="success"?"Purchase complete":"Instant buy checkout"}>
    <button className={s.close} aria-label="Close purchase dialog" onClick={()=>setPanel(null)}><X size={20}/></button>
    {panel==="login"?<><p className={s.eyebrow}>ONE QUICK STEP</p><h2>Make it yours.</h2><p>{unconfirmed?"Sign in to confirm your payment. You won’t be charged again.":"Sign in to save your cart or buy instantly."}</p><GoogleAuthButton appearance="quiet" label="Continue with Google" onAuthenticated={authenticated}/></>:panel==="success"?<><Check className={s.successIcon}/><h2>Yours to create with.</h2><p>{deliverySent?`Files and licence sent to ${paidEmail}.`:`Your purchase is complete. Email delivery to ${paidEmail} is pending.`}</p><Link className={s.pay} href="/dashboard/purchases">Open your downloads</Link></>:<>
      <p className={s.eyebrow}>{buyBeat?"INSTANT BUY":"YOUR CART"}</p><h2>{buyBeat?.title||"Ready for your next track."}</h2>
      {buyBeat&&!unconfirmed&&<div className={s.licences} role="radiogroup" aria-label="Choose beat licence">{(["mp3","wav","stems","exclusive"] as const).filter(type=>beatLicensePrice(buyBeat,type)>0).map(type=><button role="radio" aria-checked={licence===type} className={licence===type?s.selected:""} key={type} onClick={()=>{setLicence(type);setItems([{beatId:buyBeat.id,licenseType:type}]);}}>{type.toUpperCase()}<small>{money(beatLicensePrice(buyBeat,type))}{buyBeat.availableLicenses?.includes(type)?"":" ? Producer delivery"}</small></button>)}</div>}
      {quote&&<div className={s.summary}>{quote.lineItems.map((item,index)=><div key={index}><span>{item.label}<small>{item.description}</small></span><strong>{money(item.total)}</strong></div>)}</div>}
      {quote?.lineItems.map((item,index)=>item.usageTerms?<details key={index} className="my-3 max-h-52 overflow-y-auto rounded-xl border border-white/15 p-3 text-xs"><summary className="cursor-pointer font-semibold">Licence terms: {item.label}</summary><dl className="my-3 grid grid-cols-2 gap-2">{item.usageTerms.map(row=><div key={row.label}><dt>{row.label}</dt><dd className="font-semibold">{row.value}</dd></div>)}</dl>{item.licenceClauses?.map(clause=><p key={clause.title} className="mb-3 leading-5"><strong>{clause.title}. </strong>{clause.body}</p>)}</details>:null)}
      {!unconfirmed&&<BeatBuyerFields value={buyerDetails} onChange={setBuyerDetails} disabled={busy} email={viewer?.email}/>}
      <p className={s.delivery}><Mail size={15}/> Files + licence by email after payment</p>
      {error&&<p className={s.error} role="alert">{error}</p>}
      <button className={s.pay} disabled={busy||(!unconfirmed&&(loading||!quote||!items.length))} onClick={()=>void pay()}>{busy?<><Loader2 size={18} className={s.spin}/> Confirming...</>:unconfirmed?"Check payment":loading?"Checking price...":`Pay ${money(quote?.finalAmount||0)}`}</button>
      <p className={s.terms}>Secure Razorpay checkout. <Link href="/terms-of-service" target="_blank">Licence terms</Link></p>
    </>}
  </dialog>;
  return {viewer,cart,request,openCart,sheet,message,error,busy,showLogin:()=>{setPending(null);setPanel("login");}};
}
