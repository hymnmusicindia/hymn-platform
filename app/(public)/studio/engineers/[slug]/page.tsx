import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BadgeCheck, Check, Clock3, Headphones, Instagram, RotateCcw, ShieldCheck, Star, Youtube } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { StudioTrustProfile } from "@/components/studio-trust-profile";
import { StudioReport, StudioShareLink } from "@/components/studio-trust-actions";
import { EngineerShareProfile } from "@/components/engineer-share-profile";
import styles from "./profile.module.css";
import { EngineerWorkShowcase } from "@/components/engineer-work-showcase";
import { portfolioWorks } from "@/lib/engineer-portfolio";

export const dynamic = "force-dynamic";

function safeUrl(value: unknown) { return typeof value === "string" && /^https?:\/\//i.test(value) ? value : null; }
function portfolioData(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const socialRecord = record.socials && typeof record.socials === "object" && !Array.isArray(record.socials) ? record.socials as Record<string, unknown> : {};
  const works = portfolioWorks(value);
  const experience = record.experience as { years?: unknown } | undefined;
  const years = typeof experience?.years === "number" && Number.isInteger(experience.years) && experience.years > 0 && experience.years <= 60 ? experience.years : null;
  return { works, years, introVideoUrl: safeUrl(record.introVideoUrl), banner: safeUrl(record.banner), instagram: safeUrl(socialRecord.instagram), youtube: safeUrl(socialRecord.youtube) };
}
function deliverableFiles(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const files = (value as Record<string, unknown>).files;
  return Array.isArray(files) ? files.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}
function naturalList(items: string[]) { return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(items); }
function money(value: unknown) { return `₹${Number(value).toLocaleString("en-IN")}`; }

export default async function EngineerPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ beatPurchaseId?: string }> }) {
  const query = await searchParams;
  const engineer = await prisma.engineerProfile.findUnique({ where: { slug: (await params).slug }, include: { contributorParty: { include: { claimedBy: { select: { avatar: true } } } }, listings: { where: { active: true, paused: false, serviceType: "MIXING_MASTERING" } }, orders: { where: { review: { is: { status: "PUBLISHED" } } }, include: { review: true }, take: 20, orderBy: { completedAt: "desc" } } } });
  if (!engineer || engineer.sellerState !== "ACTIVE") notFound();
  const listing = engineer.listings[0];
  if (!listing) notFound();
  const portfolio = portfolioData(engineer.portfolio);
  const deliverables = deliverableFiles(listing.deliverables);
  const photo = engineer.profilePhotoUrl ?? engineer.contributorParty.claimedBy?.avatar;
  const bookingUrl = `/studio/start?listing=${listing.publicId}${query.beatPurchaseId ? `&beatPurchaseId=${encodeURIComponent(query.beatPurchaseId)}` : ""}`;
  const rating = engineer.ratingCount ? Number(engineer.ratingAverage).toFixed(1) : null;
  return <main className={styles.page}><div className="shell">
    <Link href="/studio" className={styles.back}><ArrowLeft size={16}/> Explore engineers</Link>
    <div className={styles.layout}><div className={styles.content}>
      <section className={styles.hero}>
        <div className={styles.cover}>{portfolio.banner ? <img src={portfolio.banner} alt={`${engineer.professionalName} studio banner`}/> : null}</div>
        <div className={styles.identity}><div className={styles.identityTop}>
          <div className={styles.avatar}>{photo ? <img src={photo} alt={`${engineer.professionalName} profile`} referrerPolicy="no-referrer"/> : <Headphones size={35}/>}</div>
          <div className={styles.titleBlock}><p className={styles.eyebrow}>MIXING & MASTERING ENGINEER</p><h1>{engineer.professionalName}{engineer.verificationState === "VERIFIED" ? <BadgeCheck size={24} className={styles.verified} aria-label="Verified engineer"/> : null}</h1><p className={styles.specialties}>{engineer.specialties.join(" · ")}</p></div>
        </div>{engineer.bio ? <p className={styles.bio}>{engineer.bio}</p> : null}
          <div className={styles.proof}><span><ShieldCheck size={16}/><strong>{engineer.completedOrderCount}</strong> completed projects</span><span><Star size={16}/><strong>{rating ?? "New"}</strong> {rating ? `from ${engineer.ratingCount} reviews` : "on HYMN"}</span></div>
          <Link className={styles.mobileBook} href={bookingUrl}>Start a project · {money(listing.beatCustomerPrice ?? listing.standardPrice)} <ArrowRight size={17}/></Link>
          <div className={styles.actions}><EngineerShareProfile/>{portfolio.instagram ? <a href={portfolio.instagram} target="_blank" rel="noreferrer"><Instagram size={16}/> Instagram</a> : null}{portfolio.youtube ? <a href={portfolio.youtube} target="_blank" rel="noreferrer"><Youtube size={16}/> YouTube</a> : null}</div>
        </div>
      </section>
      {portfolio.works.length ? <EngineerWorkShowcase works={portfolio.works} name={engineer.professionalName} years={portfolio.years}/> : null}
      <section className={styles.section}><p className={styles.kicker}>THE SERVICE</p><h2>Made for your music</h2><p className={styles.serviceText}>{listing.description}</p>
        {listing.sourceRequirements && typeof listing.sourceRequirements === "object" && !Array.isArray(listing.sourceRequirements) && Array.isArray((listing.sourceRequirements as {required?:unknown}).required) ? <div className={styles.prep}><h3>Before we start</h3><ul>{((listing.sourceRequirements as {required:string[]}).required).filter(item=>typeof item==="string").map(item=><li key={item}><Check size={15}/>{item}</li>)}</ul></div> : null}
        <div className={styles.deliverables}><h3><Headphones size={20}/> What you’ll receive</h3>{deliverables.length ? <><p>Your finished package includes {naturalList(deliverables)}, prepared for release and easy sharing.</p><ul>{deliverables.map(item=><li key={item}><Check size={15}/>{item}</li>)}</ul></> : <p>Your engineer will provide the finished masters described in the project agreement.</p>}</div>
      </section>
      <StudioTrustProfile profileId={engineer.id} introVideoUrl={portfolio.introVideoUrl}/>
      {engineer.orders.length ? <section className={styles.section}><p className={styles.kicker}>REAL PROJECTS</p><h2>What clients say</h2><div className={styles.reviewGrid}>{engineer.orders.map(order=><article key={order.id} className={styles.review}><span className={styles.reviewStars}>{"★".repeat(order.review?.rating ?? 0)}</span><p>Verified HYMN project</p>{order.review?.comment ? <blockquote>{order.review.comment}</blockquote> : null}<div className={styles.reviewActions}><StudioShareLink path={`/studio/share/client/${order.review?.id}`}/>{order.review ? <StudioReport targetType="CLIENT" targetId={order.review.id}/> : null}</div></article>)}</div></section> : null}
    </div><aside className={styles.aside}><div className={styles.booking}><p className={styles.bookingLabel}>YOUR PROJECT STARTS HERE</p><h2>Bring your sound<br/>into focus.</h2><div className={styles.price}><strong>{money(listing.beatCustomerPrice ?? listing.standardPrice)}</strong><span>per project</span></div><div className={styles.facts}><div><Clock3 size={18}/><span><strong>{listing.turnaroundDays} day delivery</strong><small>Estimated turnaround</small></span></div><div><RotateCcw size={18}/><span><strong>{listing.includedRevisions} revisions included</strong><small>{money(listing.additionalRevisionPrice)} for an extra revision</small></span></div></div><Link className={styles.book} href={bookingUrl}>Start a project <ArrowRight size={18}/></Link><p className={styles.secure}><ShieldCheck size={14}/> Secure booking through HYMN</p></div></aside></div>
  </div></main>;
}
