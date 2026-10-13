import { studioError } from "@/lib/studio-errors";
import { after, NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { bookConsultation } from "@/lib/studio-trust";
import { prisma } from "@/lib/prisma";
import { emailLayout, emailText } from "@/lib/email/email-templates";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { getPublicAppUrl } from "@/lib/public-app-url";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
 const auth = await requireUser(); if ("error" in auth) return auth.error;
 try {
  const slot = await bookConsultation(Number((await params).id), auth.user.id, await request.json());
  after(async () => { const recipients = [slot.bookedBy, slot.engineerProfile.contributorParty.claimedBy].filter(r => r !== null); for (const recipient of recipients) {
   const href = recipient.id === auth.user.id ? "/dashboard/studio" : "/studio/engineer/proof";
   const model = { title: "Listening consultation booked", greeting: `Hi ${recipient.name},`, body: `Your 15-minute consultation with ${slot.engineerProfile.professionalName} is booked for ${slot.startsAt.toISOString()}. Open your Studio dashboard for the booking details.`, ctaLabel: "View consultation", ctaUrl: `${getPublicAppUrl()}${href}` };
   await sendTransactionalEmail({ to: recipient.email, userId: recipient.id, eventKey: `studio:consultation:${slot.id}:${recipient.id}`, subject: model.title, template: "studio_consultation", html: emailLayout(model), text: emailText(model) });
   await prisma.notification.upsert({ where: { eventKey: `studio:consultation:${slot.id}:${recipient.id}` }, create: { userId: recipient.id, title: model.title, body: model.body, href, eventKey: `studio:consultation:${slot.id}:${recipient.id}` }, update: {} });
  } });
  return NextResponse.json({ success: true, startsAt: slot.startsAt });
 } catch(error) { return NextResponse.json({ error: studioError(error, "Could not book.") }, { status: 400 }); }
}
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
 const auth=await requireUser();if("error"in auth)return auth.error;
 try {const id=Number((await params).id);if(!Number.isSafeInteger(id))throw new Error("Invalid consultation.");
 await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${id})`;
  const slot=await tx.studioConsultation.findUnique({where:{id},include:{engineerProfile:{include:{contributorParty:true}}}});
  if(!slot||!["AVAILABLE","BOOKED"].includes(slot.status))throw new Error("Consultation is no longer active.");
  const engineerId=slot.engineerProfile.contributorParty.claimedByUserId,clientCancels=slot.bookedById===auth.user.id;
  if(!clientCancels&&engineerId!==auth.user.id)throw new Error("Consultation not found.");
  await tx.studioConsultation.update({where:{id},data:clientCancels&&slot.startsAt>new Date()?{status:"AVAILABLE",bookedById:null,phone:null,note:null}:{status:"CANCELLED"}});
  const recipient=clientCancels?engineerId:slot.bookedById;
  if(recipient)await tx.notification.create({data:{userId:recipient,title:"Listening consultation cancelled",body:`The consultation at ${slot.startsAt.toISOString()} was cancelled.`,href:clientCancels?"/studio/engineer/proof":"/dashboard/studio"}});
 });
 return NextResponse.json({success:true});
 }catch(error){return NextResponse.json({error:studioError(error)},{status:400});}
}
