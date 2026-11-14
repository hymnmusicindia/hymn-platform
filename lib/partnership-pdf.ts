import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { partnershipClauses, SOUND_SYNC_AGREEMENT_VERSION, agreementDigest } from "./partnership-agreement";

export async function buildPartnershipPdf() {
  const doc = await PDFDocument.create();
  doc.setTitle("HYMN Music x Sound Sync | Strategic Partnership Agreement");
  doc.setAuthor("HYMN Music"); doc.setSubject(SOUND_SYNC_AGREEMENT_VERSION);
  doc.registerFontkit(fontkit);
  const [regularBytes,boldBytes]=await Promise.all([readFile(path.join(process.cwd(),"public/fonts/manrope-regular.ttf")),readFile(path.join(process.cwd(),"public/fonts/manrope-bold.ttf"))]);
  const regular=await doc.embedFont(regularBytes,{subset:true,customName:"HYMN-Manrope-Regular"}),bold=await doc.embedFont(boldBytes,{subset:true,customName:"HYMN-Manrope-Bold"});
  const logo=await doc.embedPng(await readFile(path.join(process.cwd(),"public/assets/hymnlogowhite.png")));
  const ink = rgb(.06,.06,.06), muted = rgb(.34,.34,.34), accent = rgb(.12,.12,.12);
  const groups = [partnershipClauses.slice(0,3), partnershipClauses.slice(3,6), partnershipClauses.slice(6,9), partnershipClauses.slice(9)];
  for (const [index, clauses] of groups.entries()) {
    const page = doc.addPage([595.28,841.89]);
    page.drawRectangle({ x:0,y:0,width:595.28,height:841.89,color:rgb(1,1,1) });
    page.drawRectangle({x:0,y:748,width:595.28,height:93.89,color:ink});
    page.drawImage(logo,{x:48,y:776,width:105,height:105*logo.height/logo.width});
    page.drawText("PRIVATE INVITATION",{x:421,y:790,size:8,font:bold,color:rgb(1,1,1)});
    page.drawText("STRATEGIC PARTNERSHIPS",{x:405,y:771,size:7,font:regular,color:rgb(.75,.75,.75)});
    page.drawLine({start:{x:48,y:748},end:{x:547,y:748},thickness:.6,color:accent});
    page.drawText(index===0?"Strategic Partnership":index===1?"Benefits & responsibilities":index===2?"Growth & continuation":"Conduct & acceptance",{x:48,y:705,size:25,font:bold,color:ink});
    page.drawText("HYMN MUSIC  x  SOUND SYNC",{x:48,y:680,size:10,font:bold,color:accent});
    let y=644;
    if(index===0){
      page.drawRectangle({x:48,y:563,width:499,height:69,color:ink});
      page.drawText("YEARLY+",{x:65,y:600,size:17,font:bold,color:rgb(1,1,1)});
      page.drawText("COMPLIMENTARY INDIVIDUAL TERM",{x:65,y:581,size:7.5,font:regular,color:rgb(.82,.82,.82)});
      page.drawText("105",{x:399,y:598,size:25,font:bold,color:rgb(1,1,1)});
      page.drawText("CLIENTS / 4 MONTHS",{x:399,y:580,size:7,font:regular,color:rgb(.82,.82,.82)});
      y=535;
    }
    for(const clause of clauses){
      page.drawText(clause.title.toUpperCase(),{x:48,y,size:9,font:bold,color:accent}); y-=22;
      const safe=clause.body.replace(/[‘’]/g,"'").replace(/[“”]/g,'"');
      const lines:string[]=[]; let line="";
      for(const word of safe.split(/\s+/)){const next=line?`${line} ${word}`:word;if(regular.widthOfTextAtSize(next,10)>499){lines.push(line);line=word;}else line=next;}
      if(line)lines.push(line);
      for(const value of lines){if(y<88)throw Error("Agreement PDF content exceeds its page.");page.drawText(value,{x:48,y,size:10,font:regular,color:muted});y-=15;}
      y-=25;
    }
    page.drawLine({start:{x:48,y:66},end:{x:547,y:66},thickness:.5,color:accent});
    page.drawText("ELECTRONIC ACCEPTANCE / NO PHYSICAL SIGNATURE REQUIRED",{x:48,y:49,size:7,font:bold,color:ink});
    page.drawText(`${SOUND_SYNC_AGREEMENT_VERSION}  |  ${index+1} / ${groups.length}`,{x:48,y:34,size:7,font:regular,color:muted});
    page.drawText(`Content ID: ${agreementDigest().slice(0,20)}`,{x:367,y:34,size:7,font:regular,color:muted});
  }
  return Buffer.from(await doc.save());
}
