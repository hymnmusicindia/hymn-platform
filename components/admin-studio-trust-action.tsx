"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function AdminStudioTrustAction({type,id,canApprove=true}:{type:"VOUCH"|"CREDIT"|"REPORT";id:number;canApprove?:boolean}) {
 const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function decide(approve:boolean){setBusy(true);setError("");try{const response=await fetch("/api/admin/studio/trust",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({type,id,approve})});const data=await response.json();if(!response.ok)throw new Error(data.error);router.refresh();}catch(e){setError(e instanceof Error?e.message:"Review failed.");}finally{setBusy(false);}}
 return <div className="mt-4"><div className="flex gap-2"><button className="btn-primary" disabled={busy||!canApprove} onClick={()=>void decide(true)}>{type==="REPORT"?"Hide reported content":"Publish"}</button><button className="btn-outline" disabled={busy} onClick={()=>void decide(false)}>{type==="REPORT"?"Dismiss":"Reject"}</button></div>{error?<small role="alert">{error}</small>:null}</div>;
}
