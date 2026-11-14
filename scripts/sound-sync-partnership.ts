import { mkdir, writeFile } from "node:fs/promises";
import { buildPartnershipPdf } from "../lib/partnership-pdf";
import { partnershipInvitationEmail, partnershipActivatedEmail, partnershipEmailHtml } from "../lib/partnership-mail";
import { emailText } from "../lib/email/email-templates";
import { prisma } from "../lib/prisma";
import { getPublicAppUrl } from "../lib/public-app-url";
import jwt from "jsonwebtoken";
import { getAdminSessionSecret } from "../lib/env";

async function main(){
  if(!process.argv.includes("--send")){
    const directory="artifacts/sound-sync-partnership";await mkdir(directory,{recursive:true});
    await writeFile(`${directory}/HYMN-Music-Sound-Sync-Partnership-Agreement.pdf`,await buildPartnershipPdf());
    const input=partnershipInvitationEmail("0".repeat(64));
    await writeFile(`${directory}/invitation-preview.html`,partnershipEmailHtml(input));await writeFile(`${directory}/invitation-preview.txt`,emailText(input));
    const sample={agreementVersion:"sound-sync-2026-11-14-v1",subscriptionExpiresAt:new Date("2027-11-14T12:00:00Z")} as Parameters<typeof partnershipActivatedEmail>[0];
    await writeFile(`${directory}/activation-preview.html`,partnershipEmailHtml(partnershipActivatedEmail(sample,"SOUNDSYNCEXAMPLE")));
    console.log("Created PDF and both HTML email previews. Preview activation links are placeholders; no invitation or email was sent.");return;
  }
  if(new URL(getPublicAppUrl()).origin!=="https://hymnmusic.fun")throw Error("Sending requires the canonical HYMN production origin.");
  // Use the live app's configured sender; SMTP credentials stay on Hostinger.
  const session=jwt.sign({username:"admin",role:"admin"},getAdminSessionSecret(),{expiresIn:"5m"});
  const response=await fetch(`${getPublicAppUrl()}/api/admin/partnerships/sound-sync`,{method:"POST",headers:{Origin:getPublicAppUrl(),Cookie:`hymn_admin_session=${session}`,"Content-Type":"application/json"},body:JSON.stringify({action:"send_invitation",recipient:"vanshikavohra14@gmail.com"}),signal:AbortSignal.timeout(60000)});
  const result=await response.json();console.log(JSON.stringify(result));if(!response.ok)process.exitCode=1;
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Partnership operation failed.");process.exitCode=1;}).finally(()=>prisma.$disconnect());
