import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parse } from "dotenv";
Object.assign(process.env,parse(readFileSync(".env.hostinger")));
async function main(){
  const {prisma}=await import("../lib/prisma");
  const entries=[{title:"heart in love",bpm:98,keySignature:"G Minor",mood:"Romantic",file:"preview (1).mp3",copyrightConfirmed:true},{title:"4V",bpm:93,keySignature:"D Minor",mood:"Energetic",file:"preview (2).mp3",copyrightConfirmed:false}];
  const assets=entries.map(entry=>({...entry,bytes:readFileSync(`C:/Users/adity/Downloads/${entry.file}`)}));
  try{
    const result=await prisma.$transaction(async tx=>{
      const profile=await tx.producerProfile.findUniqueOrThrow({where:{userId:19},include:{user:true}});
      if(profile.displayName!=="gxrry.flac"||profile.user.name!=="Manha Dakora"||!profile.active)throw Error("Storefront identity mismatch");
      const output=[];
      for(const entry of assets){
        const existing=await tx.beat.findFirst({where:{userId:19,title:{equals:entry.title,mode:"insensitive"}}});
        if(existing){output.push({id:existing.id,title:existing.title,status:existing.status,existing:true});continue;}
        const beat=await tx.beat.create({data:{userId:19,producerPartyId:profile.contributorPartyId,title:entry.title,bpm:entry.bpm,keySignature:entry.keySignature,genre:"Hip-Hop",mood:entry.mood,priceCents:0,generalPriceCents:0,exclusivePriceCents:0,tags:[entry.mood.toLowerCase(),"wav-pending-upload","wav-planned-price-180","mp3-planned-price-120"],description:`${entry.title} by gxrry.flac. ${entry.bpm} BPM · ${entry.keySignature}. MP3 licence ₹120; WAV licence ₹180 when supplied.`,enabled:false,status:"CHANGES_REQUESTED",sampleDeclaration:entry.copyrightConfirmed?"NO_UNCONTROLLED_SAMPLES":"PENDING_DECLARATION",sampleDeclaredAt:entry.copyrightConfirmed?new Date():null,reviewIssues:{reason:"Media storage upload pending; WAV unavailable.",pending:["Upload MP3 to durable production storage","Attach supplied cover artwork",...(!entry.copyrightConfirmed?["Confirm sample rights for 4V"]:[])],suppliedMp3:{fileName:entry.file,sizeBytes:entry.bytes.length,sha256:createHash("sha256").update(entry.bytes).digest("hex")}}}});
        await tx.auditLog.create({data:{actorType:"system",action:"BEAT_OWNER_REQUESTED_DRAFT_SEEDED",entity:"beat",entityId:String(beat.id),metadata:{producerId:19,title:entry.title,mp3Price:120,plannedWavPrice:180,enabled:false,reason:"Owner explicitly requested direct database seeding; live media upload authentication unavailable."}}});
        output.push({id:beat.id,title:beat.title,status:beat.status,enabled:beat.enabled});
      }
      return output;
    });
    console.log(JSON.stringify(result));
  }finally{await prisma.$disconnect();}
}
main().catch(()=>{console.error("Beat draft seeding failed; credentials omitted.");process.exitCode=1;});
