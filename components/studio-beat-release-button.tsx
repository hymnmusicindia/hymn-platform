"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function StudioBeatReleaseButton({purchaseId}:{purchaseId:number}){const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState("");return <div><button className="btn-primary" disabled={busy} onClick={async()=>{setBusy(true);try{const response=await fetch(`/api/beat-purchases/${purchaseId}/start-release`,{method:"POST"});const data=await response.json();if(!response.ok)throw new Error(data.error);router.push(data.href);}catch(e){setError(e instanceof Error?e.message:"Could not start release.");setBusy(false);}}}>{busy?"Preparing your draft…":"Master ready · skip to distribution"}</button>{error?<p className="mt-2 text-xs" role="alert">{error}</p>:null}</div>}
