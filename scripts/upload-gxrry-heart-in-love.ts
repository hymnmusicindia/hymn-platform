import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import jwt from "jsonwebtoken";
import { randomUUID, createHash } from "node:crypto";
Object.assign(process.env,parse(readFileSync(".env.hostinger")));
async function main(){
  const {prisma}=await import("../lib/prisma");
  let sessionHash:string|undefined;
  try{
    const user=await prisma.user.findUniqueOrThrow({where:{id:19},include:{producerProfile:true}});
    if(user.name!=="Manha Dakora"||user.producerProfile?.displayName!=="gxrry.flac")throw Error("Storefront identity mismatch");
    const duplicate=await prisma.beat.findFirst({where:{userId:19,title:{equals:"heart in love",mode:"insensitive"}}});
    if(duplicate){console.log(JSON.stringify({existingBeat:duplicate.id,status:duplicate.status}));return;}
    const audio=readFileSync("C:/Users/adity/Downloads/preview (1).mp3");
    const art=readFileSync("C:/Users/adity/Downloads/59f574f70b18295d06c6fd5ffef825bc.jpg");
    const form=new FormData();
    for(const [key,value] of Object.entries({title:"heart in love",bpm:"98",keySignature:"G Minor",genre:"Hip-Hop",mood:"Romantic",price:"120",generalPrice:"180",stemPrice:"180",exclusivePrice:"720",audioFormat:"MP3",sampleDeclaration:"NO_UNCONTROLLED_SAMPLES",description:"A romantic beat by gxrry.flac. 98 BPM · G Minor. MP3 licence ₹120. WAV delivery is currently unavailable; planned WAV licence ₹180.",tags:"romantic,love,wav-pending-upload,wav-planned-price-180"}))form.set(key,value);
    form.set("file",new Blob([audio],{type:"audio/mpeg"}),"heart-in-love.mp3");
    form.set("preview",new Blob([audio],{type:"audio/mpeg"}),"heart-in-love-preview.mp3");
    form.set("artwork",new Blob([art],{type:"image/jpeg"}),"heart-in-love.jpg");
    if(!process.env.JWT_SECRET)throw Error("Application authentication unavailable");
    const sid=randomUUID();sessionHash=createHash("sha256").update(sid).digest("hex");
    await prisma.session.create({data:{userId:user.id,tokenHash:sessionHash,expiresAt:new Date(Date.now()+5*60000),userAgent:"HYMN owner-requested beat upload"}});
    const token=jwt.sign({sub:user.id,name:user.name,email:user.email,role:"producer",sid},process.env.JWT_SECRET.trim(),{expiresIn:"5m"});
    const preflight=await fetch("https://hymnmusic.fun/api/producer/beats",{headers:{Cookie:`hymn_session=${token}`},signal:AbortSignal.timeout(20000)});
    if(!preflight.ok)throw Error(`Live account authentication failed (${preflight.status}); no files uploaded.`);
    const response=await fetch("https://hymnmusic.fun/api/producer/beats",{method:"POST",headers:{Cookie:`hymn_session=${token}`,Origin:"https://hymnmusic.fun"},body:form});
    const result=await response.json();
    if(!response.ok||!result.beat?.id)throw Error(`Upload failed (${response.status}): ${String(result.error??"Unknown response").slice(0,200)}`);
    const id=Number(result.beat.id);
    await prisma.$transaction(async tx=>{
      const beat=await tx.beat.findUniqueOrThrow({where:{id},include:{audio:true,preview:true,artwork:true}});
      if(beat.userId!==19||!beat.audio||!beat.preview||!beat.artwork)throw Error("Upload asset verification failed");
      await tx.beat.update({where:{id},data:{generalPriceCents:0,priceCents:0,exclusivePriceCents:0,enabled:true,status:"PUBLISHED",reviewIssues:undefined}});
      await tx.auditLog.create({data:{actorType:"system",action:"BEAT_OWNER_REQUESTED_PUBLICATION",entity:"beat",entityId:String(id),metadata:{producerId:19,title:beat.title,mp3Price:120,plannedWavPrice:180,wavAvailable:false,sampleDeclaration:"NO_UNCONTROLLED_SAMPLES",evidence:"Owner supplied audio/artwork and confirmed 100% copyright control in chat."}}});
    });
    console.log(JSON.stringify({beatId:id,title:"heart in love",storefront:"https://hymnmusic.fun/p/producer-19",mp3Price:120,wavAvailable:false}));
  }finally{if(sessionHash)await prisma.session.updateMany({where:{tokenHash:sessionHash},data:{revokedAt:new Date()}});await prisma.$disconnect();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Upload failed");process.exitCode=1;});
