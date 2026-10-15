import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { resolvePublicUploadPaths } from "@/lib/storage";
import { FREE_BEAT_TERMS_VERSION } from "@/lib/beat-free-download";
import { isSameAppOrigin } from "@/lib/request-origin";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  if(!isSameAppOrigin(request)) return NextResponse.json({error:"Use the HYMN download agreement."},{status:403});
  const body=await request.json().catch(()=>null);
  if(body?.accepted!==true || body?.termsVersion!==FREE_BEAT_TERMS_VERSION) return NextResponse.json({error:"Accept the personal-use agreement before downloading."},{status:400});
  const id=Number((await params).id);
  if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:"Invalid beat."},{status:400});
  const beat=await prisma.beat.findFirst({where:{id,enabled:true,status:"PUBLISHED"},include:{preview:true}});
  // Only the explicitly public MP3 preview is eligible. Never use a paid master.
  const url=beat?.preview?.publicUrl;
  if(!beat || !url?.startsWith("/api/public-uploads/") || !url.toLowerCase().endsWith(".mp3")) return NextResponse.json({error:"A free MP3 preview is not available for this beat."},{status:404});
  try {
    const relative=url.slice("/api/public-uploads/".length).split("/").map(decodeURIComponent).join("/");
    let bytes:Buffer|null=null;
    for(const candidate of resolvePublicUploadPaths(relative)) {bytes=await fs.readFile(candidate).catch(error=>{if(error.code==="ENOENT")return null;throw error;});if(bytes)break;}
    if(!bytes)return NextResponse.json({error:"Preview file is currently unavailable."},{status:404});
    const session=await getSession();
    await prisma.auditLog.create({data:{actorType:session?"user":"guest",actorId:session?.sub??null,action:"BEAT_PERSONAL_DOWNLOAD_ACCEPTED",entity:"beat",entityId:String(id),metadata:{termsVersion:FREE_BEAT_TERMS_VERSION,acceptedAt:new Date().toISOString(),rights:"personal_noncommercial_only"}}});
    const filename=beat.title.replace(/[^a-zA-Z0-9 _-]/g,"").trim().slice(0,80)||"beat";
    return new NextResponse(new Uint8Array(bytes),{headers:{"Content-Type":"audio/mpeg","Content-Disposition":`attachment; filename="${filename} - personal use.mp3"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  } catch {return NextResponse.json({error:"Could not prepare the MP3. Please try again."},{status:503});}
}
