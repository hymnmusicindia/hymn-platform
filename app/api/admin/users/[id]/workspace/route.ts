import { ReleaseStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { ALL_ADMIN_PERMISSIONS, requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id:string }> }) {
  const admin=await requireAdminPermission("users.read");
  if ("error" in admin) return admin.error;
  const userId=Number((await params).id);
  const query=new URL(request.url).searchParams;
  const page=Number(query.get("page")||0);
  const releaseStatus=(query.get("releaseStatus")||"all").toUpperCase();
  if(releaseStatus!=="ALL"&&!Object.values(ReleaseStatus).includes(releaseStatus as ReleaseStatus))return NextResponse.json({error:"Invalid release status."},{status:400});
  if (!Number.isSafeInteger(userId)||userId<1||!Number.isSafeInteger(page)||page<0||page>10000) return NextResponse.json({error:"Invalid user or page."},{status:400});
  const permissions=admin.adminRole === "super_admin" ? ALL_ADMIN_PERMISSIONS : admin.permissions as string[];
  const can=(permission:string)=>permissions.includes(permission);
  const catalogue=can("releases.read");
  const finance=can("payouts.review")||can("royalties.reconcile");
  const support=can("services.manage")||can("system.manage");
  const audit=can("audit.read");
  const take=25,skip=page*take;
  const owned={archivedAt:null,OR:[{ownerUserId:userId},{ownerUserId:null,userId,releaseSource:{not:"ADMIN_MANUAL" as const}}]};
  try {
    const user=await prisma.user.findUnique({where:{id:userId},select:{id:true,name:true,email:true,role:true,status:true,createdAt:true,updatedAt:true,onboardingCompletedAt:true,handle:{select:{tag:true}},producerProfile:{select:{displayName:true,status:true,active:true}},subscription:{select:{id:true,plan:true,planName:true,status:true,expiryDate:true,releasesUsed:true,releaseLimit:true,autoRenewal:true}}}});
    if (!user) return NextResponse.json({error:"User not found."},{status:404});
    const activityWhere={OR:[{actorId:userId},{entity:"user",entityId:String(userId)},{entity:"checkout_wallet",entityId:String(userId)},...(user.subscription?[{entity:"subscription",entityId:String(user.subscription.id)}]:[])]};
    const [releaseCounts,releases,beats,beatCount,tickets,ticketCount,orders,orderCount,distribution,distributionCount,payouts,payoutCount,activity,activityCount,latestSession]=await Promise.all([
      catalogue?prisma.release.groupBy({by:["status"],where:owned,_count:{_all:true}}):[],
      catalogue?prisma.release.findMany({where:{...owned,...(releaseStatus!=="ALL"?{status:releaseStatus as ReleaseStatus}:{})},orderBy:[{createdAt:"desc"},{id:"desc"}],skip,take,select:{id:true,title:true,artistName:true,status:true,artworkUrl:true,releaseDate:true,createdAt:true,upc:true,releaseSource:true}}):[],
      catalogue?prisma.beat.findMany({where:{userId},orderBy:[{createdAt:"desc"},{id:"desc"}],skip,take,select:{id:true,title:true,status:true,enabled:true,createdAt:true}}):[],
      catalogue?prisma.beat.count({where:{userId}}):null,
      support?prisma.supportTicket.findMany({where:{userId},orderBy:[{createdAt:"desc"},{id:"desc"}],skip,take,select:{id:true,subject:true,status:true,priority:true,category:true,createdAt:true,updatedAt:true,relatedReleaseId:true}}):[],
      support?prisma.supportTicket.count({where:{userId}}):null,
      finance?prisma.checkoutOrder.findMany({where:{userId},orderBy:[{createdAt:"desc"},{id:"desc"}],skip,take,select:{id:true,productId:true,finalAmount:true,currency:true,paymentStatus:true,createdAt:true}}):[],
      finance?prisma.checkoutOrder.count({where:{userId}}):null,
      finance?prisma.distributionOrder.findMany({where:{userId},orderBy:[{createdAt:"desc"},{id:"desc"}],skip,take,select:{id:true,plan:true,amount:true,currency:true,paymentStatus:true,createdAt:true,releaseId:true}}):[],
      finance?prisma.distributionOrder.count({where:{userId}}):null,
      finance?prisma.payoutRequest.findMany({where:{userId},orderBy:[{createdAt:"desc"},{id:"desc"}],skip,take,select:{id:true,amount:true,currency:true,status:true,sourceType:true,requestedAt:true,paidAt:true}}):[],
      finance?prisma.payoutRequest.count({where:{userId}}):null,
      audit?prisma.auditLog.findMany({where:activityWhere,orderBy:[{createdAt:"desc"},{id:"desc"}],skip,take,select:{id:true,action:true,entity:true,entityId:true,actorType:true,createdAt:true}}):[],
      audit?prisma.auditLog.count({where:activityWhere}):null,
      audit?prisma.session.findFirst({where:{userId},orderBy:{createdAt:"desc"},select:{createdAt:true}}):null
    ]);
    const counts=Object.fromEntries(releaseCounts.map(item=>[item.status.toLowerCase(),item._count._all]));
    const totals={releases:releaseCounts.reduce((sum,item)=>sum+item._count._all,0),beats:beatCount,tickets:ticketCount,orders:orderCount,distribution:distributionCount,payouts:payoutCount,activity:activityCount};
    return NextResponse.json({user,access:{catalogue,finance,support,audit},counts,totals,releases,beats,tickets,orders,distribution,payouts,activity,lastSignIn:latestSession?.createdAt||null,page,hasMore:Object.entries(totals).some(([key,total])=>{const matched=key==="releases"&&releaseStatus!=="ALL"?counts[releaseStatus.toLowerCase()]||0:total;return matched!==null&&matched>skip+take;})},{headers:{"Cache-Control":"private, no-store"}});
  } catch {
    return NextResponse.json({error:"User workspace could not be loaded. Retry in a moment."},{status:503});
  }
}
