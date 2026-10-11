import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AdminWebhookWorkspace } from "@/components/admin-webhook-workspace";
export default async function WebhookEventsPage(){
 const admin=await requireAdminPermission("system.manage");if("error" in admin)redirect("/admin");
 const events=await prisma.paymentWebhookEvent.findMany({orderBy:{receivedAt:"desc"},take:100,select:{id:true,eventType:true,razorpayOrderId:true,paymentId:true,amountMinor:true,currency:true,signatureValid:true,processingState:true,attemptCount:true,receivedAt:true,processedAt:true,errorMessage:true}});
 return <main><h1 className="text-2xl font-semibold">Payment event operations</h1><p className="workspace-caption mt-2">The latest 100 stored gateway events, verification states and processing outcomes.</p><AdminWebhookWorkspace events={events.map(event=>({...event,receivedAt:event.receivedAt.toISOString(),processedAt:event.processedAt?.toISOString()||null}))}/></main>;
}
