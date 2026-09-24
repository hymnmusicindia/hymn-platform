import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CheckCircle2, Clock3, ExternalLink, Headphones, Instagram, Music2, Youtube } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
type WorkItem = { title: string; url: string };
function safeUrl(value: unknown) { return typeof value === "string" && /^https?:\/\//i.test(value) ? value : null; }
function portfolioData(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const socialRecord = record.socials && typeof record.socials === "object" && !Array.isArray(record.socials) ? record.socials as Record<string, unknown> : {};
  const rawWorks = Array.isArray(value) ? value : Array.isArray(record.works) ? record.works : [];
  const works: WorkItem[] = rawWorks.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>, url = safeUrl(entry.url) ?? safeUrl(entry.afterUrl);
    return url ? [{ title: typeof entry.title === "string" ? entry.title : "Featured work", url }] : [];
  });
  return { works, instagram: safeUrl(socialRecord.instagram), youtube: safeUrl(socialRecord.youtube) };
}
function deliverableFiles(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const files = (value as Record<string, unknown>).files;
  return Array.isArray(files) ? files.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}
function naturalList(items: string[]) { return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(items); }
function platform(url: string) { try { return new URL(url).hostname.replace(/^www\./, "").replace("open.spotify.com", "Spotify").replace("youtube.com", "YouTube").replace("youtu.be", "YouTube").replace("soundcloud.com", "SoundCloud"); } catch { return "Listen"; } }

export default async function EngineerPage({ params }: { params: Promise<{ slug: string }> }) {
  const engineer = await prisma.engineerProfile.findUnique({ where: { slug: (await params).slug }, include: { contributorParty: { include: { claimedBy: { select: { avatar: true } } } }, listings: { where: { active: true, paused: false, serviceType: "MIXING_MASTERING" } }, orders: { where: { review: { is: { status: "PUBLISHED" } } }, include: { review: true }, take: 20, orderBy: { completedAt: "desc" } } } });
  if (!engineer || engineer.sellerState !== "ACTIVE") notFound();
  const listing = engineer.listings[0];
  if (!listing) notFound();
  const portfolio = portfolioData(engineer.portfolio), deliverables = deliverableFiles(listing.deliverables);
  return <main className="shell pb-24 pt-8"><div className="grid gap-8 lg:grid-cols-[1fr_22rem]"><div>
    <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-7 sm:p-10"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="grid h-24 w-24 place-items-center overflow-hidden rounded-3xl bg-[var(--bg-soft)]">{engineer.profilePhotoUrl ?? engineer.contributorParty.claimedBy?.avatar ? <img src={engineer.profilePhotoUrl ?? engineer.contributorParty.claimedBy?.avatar ?? ""} alt={`${engineer.professionalName} profile`} referrerPolicy="no-referrer" className="h-full w-full object-cover"/> : <Headphones className="h-9 w-9"/>}</div><div><p className="hymn-kicker">HYMN Studio engineer</p><h1 className="mt-2 flex items-center gap-2 text-4xl font-semibold">{engineer.professionalName}{engineer.verificationState === "VERIFIED" ? <BadgeCheck className="h-6 w-6 text-[var(--info)]" aria-label="Verified engineer"/> : null}</h1><p className="mt-2 text-[var(--text-muted)]">{engineer.specialties.join(" · ")}</p>{portfolio.instagram || portfolio.youtube ? <div className="mt-4 flex flex-wrap gap-2">{portfolio.instagram ? <a className="btn-outline !min-h-9 !px-3 !py-2 text-xs" href={portfolio.instagram} target="_blank" rel="noreferrer"><Instagram className="h-4 w-4"/>Instagram</a> : null}{portfolio.youtube ? <a className="btn-outline !min-h-9 !px-3 !py-2 text-xs" href={portfolio.youtube} target="_blank" rel="noreferrer"><Youtube className="h-4 w-4"/>YouTube</a> : null}</div> : null}</div></div><p className="mt-8 max-w-3xl whitespace-pre-line leading-7 text-[var(--text-muted)]">{engineer.bio}</p></section>
    {portfolio.works.length ? <section className="mt-6 rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-7"><p className="hymn-kicker">Selected work</p><h2 className="mt-2 text-2xl font-semibold">Listen to their sound</h2><p className="mt-2 text-sm text-[var(--text-muted)]">Songs, mixes, and production work shared by {engineer.professionalName}.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{portfolio.works.map(item => { const directAudio = /\.(?:mp3|wav|m4a|aac|ogg|flac)(?:\?|$)/i.test(item.url); return <article key={`${item.title}-${item.url}`} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Music2 className="h-5 w-5"/></span><h3 className="mt-3 font-semibold">{item.title}</h3><p className="mt-1 text-xs text-[var(--text-soft)]">{platform(item.url)}</p>{directAudio ? <audio className="mt-4 w-full" controls preload="metadata" src={item.url}/> : <a className="btn-outline mt-4 w-full justify-center" href={item.url} target="_blank" rel="noreferrer">Listen to this work<ExternalLink className="h-4 w-4"/></a>}</article>; })}</div></section> : null}
    <section className="mt-6 rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-7"><h2 className="text-2xl font-semibold">About this service</h2><p className="mt-4 leading-7 text-[var(--text-muted)]">{listing.description}</p><div className="mt-7 rounded-2xl bg-[var(--bg-soft)] p-5"><h3 className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5 text-[var(--success)]"/>What you’ll receive</h3>{deliverables.length ? <><p className="mt-3 leading-7 text-[var(--text-muted)]">Your finished package includes {naturalList(deliverables)}, prepared for release and easy sharing.</p><ul className="mt-4 grid gap-2 sm:grid-cols-2">{deliverables.map(item => <li key={item} className="flex items-center gap-2 text-sm"><span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"/>{item}</li>)}</ul></> : <p className="mt-3 text-[var(--text-muted)]">Your engineer will provide the finished masters described in the project agreement.</p>}</div></section>
    {engineer.orders.length ? <section className="mt-6 rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-7"><h2 className="text-2xl font-semibold">Reviews</h2><div className="mt-5 space-y-4">{engineer.orders.map(order => <article key={order.id} className="rounded-2xl bg-[var(--bg-soft)] p-4"><p className="font-medium">{"★".repeat(order.review?.rating ?? 0)}</p>{order.review?.comment ? <p className="mt-2 text-sm text-[var(--text-muted)]">{order.review.comment}</p> : null}</article>)}</div></section> : null}
  </div><aside><div className="sticky top-24 rounded-[2rem] border border-[var(--border-strong)] bg-[var(--card)] p-6 shadow-2xl"><p className="text-sm text-[var(--text-muted)]">Mixing & Mastering</p><p className="mt-2 text-3xl font-semibold text-[var(--money)]">₹{Number(listing.beatCustomerPrice ?? listing.standardPrice).toLocaleString("en-IN")}</p><div className="mt-5 space-y-2 text-sm text-[var(--text-muted)]"><p className="flex items-center gap-2"><Clock3 className="h-4 w-4"/>{listing.turnaroundDays} day delivery</p><p>{listing.includedRevisions} revisions included</p><p>Additional revision: ₹{Number(listing.additionalRevisionPrice).toLocaleString("en-IN")}</p></div><Link className="btn-primary mt-6 w-full justify-center" href={`/studio/start?listing=${listing.publicId}`}>Start project</Link></div></aside></div></main>;
}
