import type { Metadata } from "next";
import { listStudioEngineers } from "@/lib/studio-services";
import { StudioReadiness } from "@/components/studio-readiness";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Free Mix-Readiness Check | HYMN Studio",description:"Prepare your vocals, stems and references, then find an engineer for your sound and budget."};
export default async function ReadinessPage({searchParams}:{searchParams:Promise<{beatPurchaseId?:string}>}){const query=await searchParams,engineers=await listStudioEngineers();return <main className="shell py-10"><StudioReadiness beatPurchaseId={Number(query.beatPurchaseId)||undefined} engineers={engineers.flatMap(e=>e.listings.slice(0,1).map(l=>({slug:e.slug,name:e.professionalName,genres:e.genres,photo:e.profilePhotoUrl,price:Number(l.standardPrice),days:l.turnaroundDays})))}/></main>}
