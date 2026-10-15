import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { execFileSync } from "node:child_process";
for (const [key,value] of Object.entries(parse(readFileSync(".env.hostinger")))) if (process.env[key] === undefined) process.env[key]=value;
async function main() {
  const {prisma}=await import("../lib/prisma");
  const {newsletterToken}=await import("../lib/newsletter");
  const {emailLayout,emailText}=await import("../lib/email/email-templates");
  const {sendTransactionalEmail}=await import("../lib/email/send-transactional-email");
  const {getEmailConfig}=await import("../lib/email/email-client");
  const {getPublicAppUrl}=await import("../lib/public-app-url");
  if(!getEmailConfig().enabled) throw Error("SMTP configuration unavailable");
  const records: string[][]=JSON.parse(execFileSync("python", ["-c", `import zipfile,xml.etree.ElementTree as E,json
with zipfile.ZipFile(r'C:\\Users\\adity\\Downloads\\HYMN_Public_Email_Prospects_Verified_Sources (1).xlsx') as z:
 n={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
 ss=[''.join(x.itertext()) for x in E.fromstring(z.read('xl/sharedStrings.xml'))] if 'xl/sharedStrings.xml' in z.namelist() else []
 out=[]
 for r in E.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//m:sheetData/m:row',n)[1:]:
  row=[]
  for c in r:
   v=c.find('m:v',n); inline=c.find('m:is',n); value=v.text if v is not None else ''.join(inline.itertext()) if inline is not None else ''
   row.append(ss[int(value)] if c.get('t')=='s' else value)
  out.append(row)
 print(json.dumps(out))`],{encoding:"utf8"}));
  let sent=0,failed=0,suppressed=0,duplicate=0;
  try {
    for(const record of records) {
      const row={getCell:(index:number)=>({text:record[index-1] ?? ""})};
      const name=row.getCell(1).text; const email=row.getCell(2).text.trim().toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error("Invalid workbook email");
      const service=row.getCell(5).text,context=row.getCell(7).text;
      const existing=await prisma.newsletterSubscriber.findUnique({where:{email}});
      if(existing && existing.status!=="subscribed") { suppressed++;continue; }
      const subscriber=existing ?? await prisma.newsletterSubscriber.create({data:{email,source:"verified_public_prospects_oct_2026",unsubscribeToken:newsletterToken()}});
      let intro="",offer="",action="";
      if(/Beat/.test(service)) {
        intro=name==="PEPPER" ? "Your BeatStars profile caught our attention: you are looking for hip-hop and rap beats, with playlists covering different moods." : name.startsWith("Ant") ? "Your public beat request mentions dark, emotional hip-hop and R&B. It also asks for free basic leases, so we want to be clear that this is an offer for paid HYMN licences if your current budget allows." : "We came across your earlier beat request. It references a 2015 project, so we would love to hear what you are creating now.";
        offer="Find the right sound for your next record with HYMN's beat catalogue. Preview beats, compare the available licence options and choose the sound that fits your project—all in one place. Spend less time searching and more time writing and recording. When your track is ready, explore distribution and professional mixing and mastering through HYMN too.";
        action="Browse the catalogue today, or send us your reference track and budget on WhatsApp so we can discuss a suitable next step.";
      } else if(/Playlist/.test(service)) {
        intro=`We came across ${name}'s public curator contact while researching music partners. Your published work in playlist curation stood out.`;
        offer="Bring your artist relationships into HYMN's music ecosystem. We would like to discuss a curator partnership alongside HYMN's distribution and artist services, giving artists a clearer route from finished music to their next release. If your intake is still active, let's explore how working together could save coordination time and create relevant opportunities.";
        action="Reply with the genres you currently cover, or contact us on WhatsApp to discuss partnership fit. Any review or discovery opportunity depends on fit; placement and streams are never guaranteed.";
      } else {
        intro=`We found ${name}'s public invitation for ${/engineer/.test(service)?"mixing and mastering collaboration":"artist distribution enquiries"}. Your focus on ${/engineer/.test(service)?"artist relationships and audio work":"helping independent artists release music"} looks relevant to HYMN.`;
        offer="Give your artists a simpler path to their next release with HYMN's distribution, beat licensing and artist services. A referral or service collaboration can help connect your creative work with the release support artists need, while saving time coordinating separate providers. We'd like to discuss how HYMN could complement your existing services.";
        action="Send us your current service scope and collaboration terms on WhatsApp. Let's identify a practical first project together.";
      }
      const subject=`${name}: ${/Beat/.test(service)?"find your next beat with HYMN":"let's move your artists forward with HYMN"}`;
      const model={title:/Beat/.test(service)?"Your next record starts with the right beat.":"Great music deserves a clear next step.",greeting:`Hi ${name},`,body:`${intro}\n\n${offer}\n\n${action}\n\nWarm regards,\nThe HYMN Music team`,ctaLabel:/Beat/.test(service)?"Explore beats & licences":"Explore HYMN services",ctaUrl:getPublicAppUrl()+(/Beat/.test(service)?"/beat-store":"/services"),sections:[{title:"Why we reached out",body:"We found your business email in public music research. This is a commercial introduction from HYMN Music. You can opt out at any time.",linkLabel:"Unsubscribe",linkUrl:`${getPublicAppUrl()}/newsletter/unsubscribe?token=${encodeURIComponent(subscriber.unsubscribeToken)}`}]};
      const result=await sendTransactionalEmail({to:email,subject,html:emailLayout(model).replace("This transactional message relates to your HYMN account, purchase or release.","A commercial introduction from HYMN Music."),text:emailText(model).replace("This transactional message relates to your HYMN account, purchase or release.","A commercial introduction from HYMN Music."),template:"verified_prospect_offer",eventKey:`verified-prospects-oct-2026:${subscriber.id}:offer-v1`,entityType:"newsletter_subscriber",entityId:subscriber.id});
      if(result.status==="sent") sent++;else if(result.status==="duplicate_skipped") duplicate++;else failed++;
      console.log(JSON.stringify({name,email,status:result.status,context}));
    }
    console.log(JSON.stringify({sent,failed,suppressed,duplicate}));
  } finally {await prisma.$disconnect();}
}
main().catch(()=>{console.error("Prospect send failed; credentials omitted.");process.exitCode=1;});
