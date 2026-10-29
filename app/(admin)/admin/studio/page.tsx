import {OperationsPanels} from "@/components/operations-panels";
import {StudioProjectRecords} from "@/components/studio-project-records";
import { AdminStudioTrust } from "@/components/admin-studio-trust";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminAccessForPage } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AdminStudioEngineerManager } from "@/components/admin-studio-engineer-manager";
import { AdminEngineerApplications } from "@/components/admin-engineer-applications";
export const dynamic = "force-dynamic";
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
export default async function AdminStudioPage() {
  const admin = await getAdminAccessForPage(); if (!admin?.permissions.includes("services.manage")) redirect("/admin");
  const failures:string[]=[];
  const safe=async<T,>(label:string,query:Promise<T>,fallback:T):Promise<T>=>{try{return await query;}catch{failures.push(label);console.error("Studio section unavailable",{section:label});return fallback;}};
  const [orders, engineers, beatPurchases, payments, earnings, handoffs, revisions, users, applications] = await Promise.all([
    safe('Projects',prisma.studioServiceOrder.findMany({ include: { customer: { select: { name: true, email: true } }, engineerProfile: { select: { professionalName: true } }, payments: true }, orderBy: { updatedAt: "desc" }, take: 250 }),[]),
    safe('Engineers',prisma.engineerProfile.findMany({ include: { listings: { orderBy: { createdAt: "asc" } }, contributorParty: { include: { claimedBy: { select: { id: true, name: true, email: true, avatar: true } } } } }, orderBy: { professionalName: "asc" } }),[]),
    safe('Beat purchases',prisma.beatPurchase.count({ where: { hasAccess: true } }),0),
    safe('Payments',prisma.studioPayment.findMany({ where: { status: "CAPTURED" }, select: { amount: true, purpose: true } }),[]),
    safe('Earnings',prisma.studioEarning.aggregate({ _sum: { commissionAmount: true } }),{_sum:{commissionAmount:null}}),
    safe('Distribution handoffs',prisma.studioReleaseHandoff.count(),0),
    safe('Revisions',prisma.studioRevision.count(),0),
    safe('Account roster',prisma.user.findMany({ where: { status: "ACTIVE", OR: [{ claimedContributorParty: null }, { claimedContributorParty: { is: { engineerProfile: null } } }] }, select: { id: true, name: true, email: true, avatar: true }, orderBy: [{ name: "asc" }, { email: "asc" }], take: 1000 }),[]),
    safe('Applications',prisma.engineerApplication.findMany({ include: { user: { select: { name: true, email: true, avatar: true } } }, orderBy: { updatedAt: "desc" }, take: 250 }),[])
  ]);
  const total=orders.length, completed=orders.filter(o=>o.status==="COMPLETED"), cancelled=orders.filter(o=>o.status==="CANCELLED").length, refunded=orders.filter(o=>o.status==="REFUNDED").length, beatLinked=orders.filter(o=>o.sourceBeatPurchaseId).length;
  const gmv=payments.reduce((sum,row)=>sum+Number(row.amount),0), paidRevisionRevenue=payments.filter(row=>row.purpose==="ADDITIONAL_REVISION").reduce((sum,row)=>sum+Number(row.amount),0);
  const turnaround=completed.map(o=>o.startedAt&&o.completedAt?(o.completedAt.getTime()-o.startedAt.getTime())/86400000:null).filter((v):v is number=>v!==null);
  const percent=(value:number,denominator=total)=>denominator?`${((value/denominator)*100).toFixed(1)}%`:"—";
  const metrics=[["Beat → Studio",percent(beatLinked,beatPurchases),`${beatLinked} linked orders`],["Studio GMV",money(gmv),"Captured payments"],["HYMN revenue",money(Number(earnings._sum.commissionAmount??0)),"Released commission"],["Average order",total?money(gmv/total):"—","Captured GMV / orders"],["Revisions / order",total?(revisions/total).toFixed(2):"—",`${revisions} requests`],["Paid revisions",money(paidRevisionRevenue),"Verified payments"],["Completion",percent(completed.length),`${completed.length} completed`],["Cancellation",percent(cancelled),`${cancelled} cancelled`],["Refund",percent(refunded),`${refunded} refunded`],["Avg turnaround",turnaround.length?`${(turnaround.reduce((a,b)=>a+b,0)/turnaround.length).toFixed(1)} days`:"—","Start to completion"],["Studio → Distribution",percent(handoffs,completed.length),`${handoffs} handoffs`],["Engineers",String(engineers.length),"Canonical profiles"]];
  const stringList = (value: unknown, key: string) => value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as Record<string, unknown>)[key]) ? ((value as Record<string, unknown>)[key] as unknown[]).filter((item): item is string => typeof item === "string") : [];
  const portfolioData = (value: unknown) => {
    const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const socials = record.socials && typeof record.socials === "object" && !Array.isArray(record.socials) ? record.socials as Record<string, unknown> : {};
    const works = Array.isArray(value) ? value : Array.isArray(record.works) ? record.works : [];
    return { socialLinks: { instagram: typeof socials.instagram === "string" ? socials.instagram : "", youtube: typeof socials.youtube === "string" ? socials.youtube : "" }, portfolioItems: works.flatMap(item => { if (!item || typeof item !== "object") return []; const work = item as Record<string, unknown>, url = typeof work.url === "string" ? work.url : typeof work.afterUrl === "string" ? work.afterUrl : null; return url ? [{ title: typeof work.title === "string" ? work.title : "Featured work", url }] : []; }) };
  };
  const applicationRows = applications.map(item => ({ id: item.id, profileExtras: item.profileExtras as { photo?: string; banner?: string; works?: { title: string; url: string; role?: string }[] } | null, professionalName: item.professionalName, bio: item.bio, specialties: item.specialties, genres: item.genres, portfolioUrl: item.portfolioUrl, instagramUrl: item.instagramUrl, experienceLevel: item.experienceLevel, startingPrice: Number(item.startingPrice), turnaroundDays: item.turnaroundDays, status: item.status, reviewNote: item.reviewNote, createdAt: item.createdAt.toISOString(), user: item.user }));
  const roster = engineers.flatMap(engineer => {
    const listing = engineer.listings[0], user = engineer.contributorParty.claimedBy;
    if (!listing || !user) return [];
    return [{ id: engineer.id, userId: user.id, userName: user.name, userEmail: user.email, userAvatar: user.avatar ?? "", professionalName: engineer.professionalName, slug: engineer.slug, profilePhotoUrl: engineer.profilePhotoUrl ?? user.avatar ?? "", bio: engineer.bio, specialties: engineer.specialties, genres: engineer.genres, ...portfolioData(engineer.portfolio), availability: engineer.availability, maxActiveOrders: engineer.maxActiveOrders, verificationState: engineer.verificationState, sellerState: engineer.sellerState, payoutState: engineer.payoutState, listing: { title: listing.title, description: listing.description, standardPrice: Number(listing.standardPrice), beatCustomerPrice: listing.beatCustomerPrice === null ? null : Number(listing.beatCustomerPrice), includedRevisions: listing.includedRevisions, additionalRevisionPrice: Number(listing.additionalRevisionPrice), turnaroundDays: listing.turnaroundDays, sourceRequirements: stringList(listing.sourceRequirements, "required"), deliverables: stringList(listing.deliverables, "files"), instantAccept: listing.instantAccept, active: listing.active, paused: listing.paused } }];
  });
  return <main className="shell min-w-0 py-8"><header className="flex flex-wrap items-start justify-between gap-4"><div><p className="hymn-kicker">MARKETPLACE & STUDIO</p><h1 className="mt-2 text-3xl font-semibold">Studio operations</h1><p className="mt-2 text-sm text-[var(--text-muted)]">Projects, people and delivery. Keep the next action in view.</p></div><Link className="btn-outline text-sm" href="/admin?tab=operations">Back to Marketplace workspace</Link></header>{failures.length>0&&<p role="alert" className="mt-5 rounded-xl border border-amber-400/30 p-4 text-sm">Some sections could not load: {failures.join(", ")}. Counts may be incomplete. Refresh this page to retry; available sections remain usable.</p>}<section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Active projects",orders.filter(order=>!['COMPLETED','CANCELLED','REFUNDED'].includes(order.status)).length],["Engineer applications",applications.filter(item=>item.status==='PENDING').length],["Verified Studio sales",money(gmv)],["Completed projects",completed.length]].map(([label,value])=><div className="metric-card" key={label}><p className="text-xs text-[var(--text-muted)]">{label}</p><strong className="mt-3 block text-2xl">{value}</strong></div>)}</section><OperationsPanels panels={[
 {key:'projects',label:'Projects',count:orders.length,content:<StudioProjectRecords orders={orders.map(order=>({id:order.publicId,title:order.projectTitle,customer:order.customer.name,email:order.customer.email,engineer:order.engineerProfile.professionalName,status:order.status,payment:order.paymentStatus,updatedAt:order.updatedAt.toISOString(),beatLinked:Boolean(order.sourceBeatPurchaseId)}))}/>},
 {key:'engineers',label:'Engineers & services',count:roster.length,content:<AdminStudioEngineerManager users={users} engineers={roster}/>},
 {key:'applications',label:'Applications',count:applications.length,content:<AdminEngineerApplications applications={applicationRows}/>},
 {key:'trust',label:'Trust & safeguards',content:<AdminStudioTrust/>},
 {key:'reports',label:'Performance',content:<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label,value,detail])=><div className="metric-card" key={label}><p className="text-xs uppercase tracking-[.14em] text-[var(--text-soft)]">{label}</p><strong className="mt-3 block text-2xl">{value}</strong><small className="mt-1 block text-[var(--text-muted)]">{detail}</small></div>)}</section>}
 ]}/></main>;
}
