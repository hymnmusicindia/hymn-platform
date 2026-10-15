import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BadgeCheck, BriefcaseBusiness, CircleDollarSign, Clock3, ExternalLink, Headphones, Settings2, Sparkles, Star } from "lucide-react";
import { getCurrentUserForPage } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import styles from "./engineer-dashboard.module.css";

export const dynamic = "force-dynamic";

const CLOSED_STATUSES = new Set(["COMPLETED", "CANCELLED", "REFUNDED", "EXPIRED"]);
const ATTENTION_STATUSES = new Set(["AWAITING_ENGINEER_ACCEPTANCE", "REVISION_REQUESTED", "DISPUTED"]);
const nextStep: Record<string, string> = { AWAITING_ENGINEER_ACCEPTANCE:"Review request", ACCEPTED:"Request source files", AWAITING_SOURCE_FILES:"Waiting for files", IN_PROGRESS:"Continue project", DELIVERED:"Awaiting client review", REVISION_PAYMENT_REQUIRED:"Revision payment due", REVISION_REQUESTED:"Review revision", CUSTOMER_APPROVED:"Complete project", DISPUTED:"Resolve issue", REFUND_PENDING:"Refund in review" };

function money(value: number) { return new Intl.NumberFormat("en-IN", { style:"currency", currency:"INR", maximumFractionDigits:0 }).format(value); }
function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/(^|\s)\S/g, character => character.toUpperCase()); }

export default async function EngineerStudioDashboard() {
  const user = await getCurrentUserForPage();
  if (!user) redirect("/login");
  const profile = await prisma.engineerProfile.findFirst({ where:{ contributorParty:{ claimedByUserId:user.id } }, include:{ orders:{ include:{ customer:{ select:{ name:true } }, earning:{ select:{ netAmount:true, status:true } } }, orderBy:{ updatedAt:"desc" } } } });
  if (!profile) return <main className="shell py-10"><section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8"><p className="hymn-kicker">Engineer Studio</p><h1 className="mt-2 text-3xl font-semibold">Engineer capability is not enabled</h1><p className="mt-3 text-[var(--text-muted)]">HYMN operations must verify and activate your service profile before you can accept projects.</p></section></main>;

  const open = profile.orders.filter(order => !CLOSED_STATUSES.has(order.status));
  const completed = profile.orders.filter(order => order.status === "COMPLETED");
  const attention = open.filter(order => ATTENTION_STATUSES.has(order.status));
  const earnings = profile.orders.reduce((sum, order) => sum + Number(order.earning?.netAmount ?? 0), 0);
  const capacity = Math.min(100, Math.round((open.length / Math.max(profile.maxActiveOrders, 1)) * 100));

  return <main className={`shell ${styles.dashboard}`}>
    <header className={styles.hero}><div><div className={styles.eyebrow}><span>Engineer Studio</span>{profile.verificationState === "VERIFIED" ? <span className={styles.verified}><BadgeCheck size={14}/> Verified</span> : null}</div><h1>Welcome back, {profile.professionalName}.</h1><p>{attention.length ? `${attention.length} ${attention.length === 1 ? "project needs" : "projects need"} your attention today.` : "Your studio is clear. New work will appear here."}</p></div><div className={styles.heroActions}><Link className="btn-primary" href="/studio/engineer/proof"><Sparkles size={16}/> Manage showcases</Link><Link className="btn-outline" href={`/studio/engineers/${profile.slug}`}><ExternalLink size={16}/> View public profile</Link><Link className={styles.iconAction} href="/studio/engineer/profile" aria-label="Edit engineer profile"><Settings2 size={18}/></Link></div></header>

    <section className={styles.overview} aria-label="Studio overview">
      <article className={`${styles.metric} ${styles.capacityCard}`}><div className={styles.metricHeading}><span>Current capacity</span><BriefcaseBusiness size={18}/></div><div className={styles.capacityBody}><div className={styles.ring} style={{ "--capacity":`${capacity * 3.6}deg` } as React.CSSProperties}><strong>{open.length}</strong><span>of {profile.maxActiveOrders}</span></div><div><strong>{Math.max(0, profile.maxActiveOrders - open.length)} slots open</strong><p>{label(profile.availability)}</p></div></div></article>
      <article className={styles.metric}><div className={styles.metricHeading}><span>Needs attention</span><Clock3 size={18}/></div><strong className={styles.metricValue}>{attention.length}</strong><p>{attention.length ? "Open these projects first" : "Nothing waiting on you"}</p></article>
      <article className={styles.metric}><div className={styles.metricHeading}><span>Completed</span><Headphones size={18}/></div><strong className={styles.metricValue}>{completed.length}</strong><p>{profile.orders.length ? `${Math.round((completed.length / profile.orders.length) * 100)}% of all projects` : "Ready for your first project"}</p></article>
      <article className={styles.metric}><div className={styles.metricHeading}><span>Studio earnings</span><CircleDollarSign size={18}/></div><strong className={styles.metricValue}>{money(earnings)}</strong><p>Net earnings recorded</p></article>
    </section>

    <section className={styles.workSection}><div className={styles.sectionHeading}><div><p className="hymn-kicker">Project desk</p><h2>Active work</h2></div><span>{open.length} open</span></div>{open.length ? <div className={styles.projectList}>{open.map(order => { const urgent = ATTENTION_STATUSES.has(order.status); return <Link key={order.id} href={`/studio/orders/${order.publicId}`} className={styles.project}><span className={`${styles.projectMark} ${urgent ? styles.urgent : ""}`}><Headphones size={19}/></span><span className={styles.projectMain}><strong>{order.projectTitle}</strong><small>{order.customer.name} · Updated {order.updatedAt.toLocaleDateString("en-IN", { day:"numeric", month:"short" })}</small></span><span className={styles.projectState}><span className={urgent ? styles.attentionBadge : styles.statusBadge}>{label(order.status)}</span><small>{nextStep[order.status] ?? "Open project"}</small></span><ArrowRight className={styles.arrow} size={18}/></Link>; })}</div> : <div className={styles.empty}><Headphones size={28}/><h3>No active projects</h3><p>Your next client request will appear here.</p><Link href={`/studio/engineers/${profile.slug}`} className="btn-outline">Check your public profile</Link></div>}</section>

    <section className={styles.bottomGrid}><article className={styles.performance}><div className={styles.sectionHeading}><div><p className="hymn-kicker">Reputation</p><h2>Client signal</h2></div><Star size={20}/></div><div className={styles.rating}><strong>{profile.ratingAverage ? Number(profile.ratingAverage).toFixed(1) : "—"}</strong><div><span>{profile.ratingCount} client {profile.ratingCount === 1 ? "vouch" : "vouches"}</span><p>{profile.completedOrderCount} verified completions</p></div></div><Link href="/studio/engineer/proof">Build your public proof <ArrowRight size={15}/></Link></article><article className={styles.quickActions}><div className={styles.sectionHeading}><div><p className="hymn-kicker">Quick actions</p><h2>Keep your studio ready</h2></div></div><Link href="/studio/engineer/profile"><Settings2 size={18}/><span><strong>Edit profile</strong><small>Update your bio, genres, and portfolio</small></span><ArrowRight size={16}/></Link><Link href="/studio/engineer/proof"><Sparkles size={18}/><span><strong>Showcases & calls</strong><small>Manage proof and listening-call slots</small></span><ArrowRight size={16}/></Link></article></section>
  </main>;
}
