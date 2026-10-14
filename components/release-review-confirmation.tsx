"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, Clock3, Disc3, HelpCircle } from "lucide-react";
import { CoverArt } from "@/components/cover-art";
import type { Release } from "@/lib/types";
import styles from "./release-review-confirmation.module.css";
import { ReleaseCurationInvitation } from "./release-curation-invitation";

export function ReleaseReviewConfirmation({ release, onReset, isResubmission = false, resetLabel = "Submit another release" }: { release: Release; onReset: () => void; isResubmission?: boolean; resetLabel?: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      const viewport = heading.current?.closest(".portal-page-content");
      if (viewport) viewport.scrollTop = 0;
      else window.scrollTo({ top: 0, behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const title = release.releaseTitle || release.trackName || "Untitled release";
  const date = release.releaseDate ? new Date(`${release.releaseDate.slice(0, 10)}T00:00:00`) : null;
  const releaseDate = date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date) : "To be confirmed";
  const href = `/dashboard/releases?releaseId=${release.id}`;
  const steps = [
    { title: isResubmission ? "Changes received" : "Submission received", copy: "Your release package is saved in your HYMN account.", state: "done" },
    { title: "HYMN review", copy: "We check your audio, artwork, metadata and distribution rights.", state: "current" },
    { title: "Distribution processing", copy: "After approval, your release is sent for distributor and platform checks.", state: "next" },
    { title: "Scheduled or live", copy: "Track platform availability and live links from your release dashboard.", state: "next" }
  ];
  const faqs = [
    { question: "When will my release go live?", answer: "HYMN review typically takes 24–48 hours, but corrections and additional rights checks can take longer. Platform processing follows approval. Your requested release date is not a guarantee of availability." },
    { question: "What if a correction is needed?", answer: "We’ll show the review reason and required changes in your release dashboard and notify you through your account and email. Follow that request before resubmitting; you don’t need to create a duplicate release." },
    { question: "Where can I track updates?", answer: "Open your release dashboard to see the latest status, review notes and distribution progress. You can safely leave this page—your submission is saved." }
  ];
  return <section className={styles.page} data-release-review-confirmation aria-labelledby="release-review-heading">
    {!isResubmission ? <ReleaseCurationInvitation releaseId={release.id} context={{ genre: release.primaryGenre || release.genre, mood: release.mood, releaseType: release.releaseType }} /> : null}
    <header className={styles.header}>
      <div><p className={styles.eyebrow}><CheckCircle2 size={15} aria-hidden="true" /> {isResubmission ? "Updates received" : "Submission received"}<span>Release #{release.id}</span></p>
        <h1 id="release-review-heading" ref={heading} tabIndex={-1}>{isResubmission ? "Your changes are back in review" : "Your release is under review"}</h1>
        <p className={styles.intro}>Your music is safely in your HYMN account. We’ll review the package before moving it to distribution.</p>
      </div>
      <Link href={href} className={styles.primary}>Track your release <ArrowRight size={16} aria-hidden="true" /></Link>
    </header>
    <div className={styles.layout}>
      <div className={styles.main}>
        <section className={styles.reassurance} aria-labelledby="review-action-heading"><CheckCircle2 size={22} aria-hidden="true" /><div><h2 id="review-action-heading">You’re all set for now.</h2><p>No further action is needed unless we request a correction. You can leave this page—your submission is saved.</p></div></section>
        <section className={styles.timelinePanel} aria-labelledby="review-next-heading"><div className={styles.panelHeading}><h2 id="review-next-heading">What happens next</h2><span>Step 2 of 4</span></div>
          <ol className={styles.timeline}>{steps.map((step, index) => <li key={step.title} data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
            <span className={styles.node} aria-hidden="true">{step.state === "done" ? <Check size={16} /> : step.state === "current" ? <Clock3 size={16} /> : String(index + 1).padStart(2, "0")}</span>
            <div><h3>{step.title}{step.state === "current" ? <span className={styles.current}>In progress</span> : null}</h3><p>{step.copy}</p></div>
          </li>)}</ol>
        </section>
        <dl className={styles.expectations}><div><dt>Typical HYMN review</dt><dd>24–48 hours</dd><small>May take longer if checks are needed</small></div><div><dt>Where you’ll get updates</dt><dd>Dashboard & email</dd><small>Keep an eye out for review requests</small></div></dl>
      </div>
      <aside className={styles.summary} aria-labelledby="review-release-title"><p className={styles.summaryLabel}>Your release</p>
        <div className={styles.identity}>{release.artworkUrl ? <CoverArt src={release.artworkUrl} previewWidth={320} width={320} height={320} loading="eager" alt={`${title} cover artwork`} className={styles.artwork} /> : <div className={styles.emptyArtwork}><Disc3 size={48} aria-label="Artwork unavailable" /></div>}
          <div><h2 id="review-release-title">{title}</h2><p>{release.artistName || "HYMN Artist"}</p><span className={styles.status}><Clock3 size={13} aria-hidden="true" /> Under HYMN review</span></div>
        </div>
        <dl className={styles.metadata}><div><dt>Release reference</dt><dd>#{release.id}</dd></div><div><dt>Format</dt><dd>{release.releaseType || "Release"}{release.tracks?.length ? ` · ${release.tracks.length} ${release.tracks.length === 1 ? "track" : "tracks"}` : ""}</dd></div><div><dt>Requested release date</dt><dd>{releaseDate}</dd></div>{release.primaryGenre || release.genre ? <div><dt>Genre</dt><dd>{release.primaryGenre || release.genre}</dd></div> : null}{release.language ? <div><dt>Language</dt><dd>{release.language}</dd></div> : null}</dl>
      </aside>
    </div>
    <section className={styles.faq} aria-labelledby="review-faq-heading"><h2 id="review-faq-heading">A few things you might be wondering</h2>{faqs.map(faq => <details key={faq.question}><summary>{faq.question}<span aria-hidden="true">+</span></summary><p>{faq.answer}</p></details>)}</section>
    <footer className={styles.footer}><Link href="/faq"><HelpCircle size={16} aria-hidden="true" /> Visit the help centre</Link><button type="button" onClick={onReset}>{resetLabel}<ArrowRight size={15} aria-hidden="true" /></button></footer>
  </section>;
}
