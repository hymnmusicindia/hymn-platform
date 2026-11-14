import { findPartnership } from "@/lib/partnerships";
import { buildPartnershipPdf } from "@/lib/partnership-pdf";
import { agreementDigest } from "@/lib/partnership-agreement";
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){
  const invitation=await findPartnership((await params).token);
  if(!invitation||invitation.agreementHash!==agreementDigest())return new Response("Agreement unavailable. Please contact HYMN.",{status:404});
  return new Response(new Uint8Array(await buildPartnershipPdf()),{headers:{"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="HYMN-Music-Sound-Sync-Partnership-Agreement.pdf"',"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow","Referrer-Policy":"no-referrer"}});
}
