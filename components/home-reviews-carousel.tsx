"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import styles from "./home-reviews-carousel.module.css";

type Review = { id: number; rating: number; body: string | null; purchaseType: string; user: { name: string; avatar: string | null } };

export function HomeReviewsCarousel({ reviews }: { reviews: Review[] }) {
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(preference.matches);
    sync();
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);

  const unique = new Map<number, Review>();
  for (const review of reviews) {
    if (![4, 4.5, 5].includes(review.rating)) continue;
    const previous = unique.get(review.id);
    if (!previous || (!previous.body?.trim() && Boolean(review.body?.trim()))) unique.set(review.id, review);
  }
  const items = [...unique.values()].sort((a, b) => Number(Boolean(b.body?.trim())) - Number(Boolean(a.body?.trim())) || b.rating - a.rating);
  if (!items.length) return null;

  const reviewCards = (copy: string, clone = false) => <div key={copy} className={styles.group} aria-hidden={clone || undefined}>
    {items.map(review => <article key={`${copy}-${review.id}`} className={styles.card}>
      <div role="img" aria-label={`${review.rating} out of 5 stars`} className={styles.stars}>{Array.from({ length: 5 }, (_, index) => <span key={index} aria-hidden="true" className={styles.star} style={{ "--fill": `${Math.max(0, Math.min(1, review.rating - index)) * 100}%` } as CSSProperties}>★</span>)}</div>
      {review.body?.trim() ? <blockquote>{review.body.trim()}</blockquote> : null}
      <footer>{review.user.avatar ? <img src={review.user.avatar} alt="" referrerPolicy="no-referrer" /> : <span className={styles.avatarFallback} aria-hidden="true">{review.user.name.trim().slice(0, 1).toUpperCase()}</span>}<div><strong>{review.user.name}</strong><small>{review.purchaseType === "beat" ? "Beat Store" : "Distribution"} · Verified customer</small></div></footer>
    </article>)}
  </div>;

  return <section className={`${styles.root} ${paused ? styles.paused : ""} ${reducedMotion ? styles.reduced : ""}`} aria-label="Customer reviews" aria-roledescription="carousel" onFocusCapture={() => setPaused(true)}>
    <div className={styles.intro}>
      <p className={styles.eyebrow}>ARTISTS &amp; CREATORS</p>
      <h2>What artists think of HYMN.</h2>
      <p className={styles.summary}>Real feedback from the people bringing their music to the world.</p>
      <button type="button" className={styles.motionButton} onClick={() => setPaused(value => !value)} disabled={reducedMotion} aria-pressed={paused || reducedMotion} aria-label={reducedMotion ? "Automatic movement disabled by reduced motion preference" : paused ? "Resume review carousel" : "Pause review carousel"}>
        <span aria-hidden="true">{reducedMotion ? "◌" : paused ? "▶" : "Ⅱ"}</span>{reducedMotion ? "Motion reduced" : paused ? "Resume" : "Pause"}
      </button>
    </div>
    <div className={styles.viewport} tabIndex={0} aria-label="Customer reviews; hover or focus to pause" aria-live="off">
      <div className={styles.track}>{reviewCards("original")}{reviewCards("loop", true)}</div>
    </div>
  </section>;
}
