"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function PartnershipActivation({token,acceptance}:{token:string;acceptance:string}){
  const [agreed,setAgreed]=useState(false),[busy,setBusy]=useState(false),[complete,setComplete]=useState(false),[error,setError]=useState("");const router=useRouter();
  async function activate(){if(busy||!agreed)return;setBusy(true);setError("");const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);try{
    const response=await fetch(`/api/partnerships/${token}/activate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accepted:true}),signal:controller.signal});
    const result=await response.json();if(!response.ok)throw Error(result.error||"Please try again.");setComplete(true);router.refresh();
  }catch(err){setError(controller.signal.aborted?"We could not confirm the response. Retry safely; your benefits cannot be granted twice.":err instanceof Error?err.message:"We could not confirm activation. Please retry; your benefits cannot be granted twice.");}finally{clearTimeout(timer);setBusy(false);}}
  if(complete)return <p role="status">Your Yearly+ is active. <a href="/dashboard?tab=referral">Open your referral dashboard →</a></p>;
  return <div><p>Read the full agreement below or download the PDF before accepting.</p><label style={{display:"flex",gap:12,alignItems:"flex-start",fontSize:14,lineHeight:1.7,margin:"20px 0"}}><input style={{marginTop:6,flexShrink:0}} type="checkbox" checked={agreed} disabled={busy} onChange={e=>setAgreed(e.target.checked)}/><span>{acceptance}</span></label><button disabled={!agreed||busy} onClick={()=>void activate()} style={{border:0,borderRadius:10,padding:"16px 22px",background:"#202020",color:"white",fontWeight:700,opacity:!agreed||busy ? .5 : 1,cursor:!agreed||busy?"default":"pointer"}}>{busy?"Activating your Yearly+…":"Accept agreement & activate Yearly+"}</button>{error&&<p role="alert" style={{color:"#b32929"}}>{error}</p>}<p style={{fontSize:12}}>No payment required · No automatic renewal · One activation only</p></div>;
}
