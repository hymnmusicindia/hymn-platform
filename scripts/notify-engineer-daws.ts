import { readFileSync } from "node:fs";
import { parse } from "dotenv";
for (const [key,value] of Object.entries(parse(readFileSync(".env.hostinger")))) if (process.env[key] === undefined) process.env[key]=value;
async function main() {
  const {prisma}=await import("../lib/prisma");
  const {getEmailConfig}=await import("../lib/email/email-client");
  const {sendTransactionalEmail}=await import("../lib/email/send-transactional-email");
  const {emailLayout,emailText}=await import("../lib/email/email-templates");
  const {getPublicAppUrl}=await import("../lib/public-app-url");
  try {
    const engineers=await prisma.engineerProfile.findMany({include:{contributorParty:{include:{claimedBy:{select:{id:true,name:true,email:true,status:true}}}}}});
    let sent=0,failed=0,skipped=0;
    if(process.argv.includes("--send") && !getEmailConfig().enabled) throw Error("SMTP unavailable");
    for(const engineer of engineers) {
      const user=engineer.contributorParty.claimedBy;
      if(!user || user.status!=="ACTIVE") {skipped++;continue;}
      const eventKey=`engineer-daw-update:v1:${engineer.id}`;
      const model={title:"Which DAWs do you use?",greeting:`Hi ${engineer.professionalName},`,body:"We're adding a DAWs you use field to HYMN engineer onboarding and profiles. Please tell us which digital audio workstations you use for client projects—for example FL Studio, Logic Pro, Ableton Live, Pro Tools, Cubase, Studio One or REAPER. You can mention more than one.\n\nReply to this email with your DAWs now. Once the new selector appears in your profile, open Sound & style, select your DAWs and save your profile. Use Other DAW if your software isn't listed.\n\nThis helps us understand your setup and coordinate project handoffs. Thank you for keeping your studio details current.\n\nThe HYMN Music team",ctaLabel:"Open engineer profile",ctaUrl:`${getPublicAppUrl()}/studio/engineer/profile`};
      if(!process.argv.includes("--send")) {console.log(JSON.stringify({engineer:engineer.professionalName,to:user.email}));continue;}
      await prisma.notification.upsert({where:{eventKey},create:{eventKey,userId:user.id,title:"Tell us which DAWs you use",body:"Reply to the HYMN email with your DAWs, and update Sound & style when the new selector appears.",type:"account",href:"/studio/engineer/profile",actionLabel:"Update profile"},update:{}});
      const result=await sendTransactionalEmail({to:user.email,userId:user.id,subject:"Please share your DAWs | HYMN Studio profile update",html:emailLayout(model),text:emailText(model),template:"engineer_daw_update",eventKey:`${eventKey}:email`,entityType:"engineer_profile",entityId:engineer.id});
      if(result.status==="sent") sent++;else if(result.status==="duplicate_skipped") skipped++;else failed++;
      console.log(JSON.stringify({engineer:engineer.professionalName,status:result.status}));
    }
    console.log(JSON.stringify({engineerProfiles:engineers.length,sent,failed,skipped}));
  } finally {await prisma.$disconnect();}
}
main().catch(()=>{console.error("Engineer notification failed; credentials omitted.");process.exitCode=1;});
