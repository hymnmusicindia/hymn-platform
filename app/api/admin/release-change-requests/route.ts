import { NextResponse } from "next/server";
import { getAdminAccessForPage } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const admin=await getAdminAccessForPage();
  if(!admin||!admin.permissions.some(permission=>permission==="updates.review"||permission==="takedowns.review"))return NextResponse.json({error:"Forbidden."},{status:403});
  const scope=admin.permissions.includes("updates.review")&&admin.permissions.includes("takedowns.review")?{}:admin.permissions.includes("takedowns.review")?{requestType:"takedown"}:{requestType:{not:"takedown"}};
  const url = new URL(request.url); const status = url.searchParams.get("status") || undefined;
  return NextResponse.json({ requests: await prisma.releaseChangeRequest.findMany({ where: {...scope,...(status?{status}:{})}, orderBy: { submittedAt: "desc" }, take: 100, include: { release: { select: { id: true, title: true, artistName: true, status: true, artworkUrl: true, upc: true, metadata: true, user: { select: { email: true } } } }, events: { orderBy: { createdAt: "asc" } } } }) });
}
// vercel trigger 9
