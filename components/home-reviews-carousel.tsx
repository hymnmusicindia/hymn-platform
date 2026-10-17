"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import styles from "./home-reviews-carousel.module.css";

type Review = {
  id: number;
  rating: number;
  body: string | null;
  featured: boolean;
  featuredOrder: number;
  purchaseType: string;
  user: { id: number; name: string; avatar: string | null };
};

function reviewPriority(a: Review, b: Review) {
  return Number(Boolean(b.body?.trim())) - Number(Boolean(a.body?.trim()))
    || Number(b.featured) - Number(a.featured)
    || b.rating - a.rating
    || a.featuredOrder - b.featuredOrder;
}

export function HomeReviewsCarousel({ reviews }: { reviews: Review[] }) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(2);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobilePreference = window.matchMedia("(max-width: 760px)");
    const sync = () => {
      setReducedMotion(motionPreference.matches);
      setPageSize(mobilePreference.matches ? 1 : 2);
    };
    sync();
    motionPreference.addEventListener("change", sync);
    mobilePreference.addEventListener("change", sync);
    return () => {
      motionPreference.removeEventListener("change", sync);
      mobilePreference.removeEventListener("change", sync);
    };
  }, []);

  const byUser = new Map<number, Review>();
  for (const review of reviews) {
    if (![4, 4.5, 5].includes(review.rating)) continue;
    const current = byUser.get(review.user.id);
    if (!current || reviewPriority(review, current) < 0) byUser.set(review.user.id, review);
  }
  const items = [...byUser.values()].sort(reviewPriority);
  const pages: Review[][] = [];
  for (let index = 0; index < items.length; index += pageSize) pages.push(items.slice(index, index + pageSize));
  const pageCount = pages.length;

  useEffect(() => {
    if (pageCount < 2 || reducedMotion || paused) return;
    const interval = window.setInterval(() => setPage(current => (current + 1) % pageCount), 6200);
    return () => window.clearInterval(interval);
  }, [pageCount, reducedMotion, paused]);

  useEffect(() => setPage(current => Math.min(current, Math.max(0, pageCount - 1))), [pageSize, pageCount]);

  if (!items.length) return null;

  return <section className={styles.root} aria-label="Customer reviews" aria-roledescription="carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
    <div className={styles.intro}>
      <p className={styles.eyebrow}>ARTIST REVIEWS</p>
      <h2>In their own words.</h2>
      <p className={styles.summary}>Notes from artists who release and grow with HYMN.</p>
    </div>
    <div className={styles.viewport} tabIndex={0} aria-label={`Customer reviews, page ${page + 1} of ${pageCount}`} aria-live="off">
      <div key={page} className={styles.group}>
      {pages[page]?.map(review => <article key={review.id} className={styles.card}>
      <div role="img" aria-label={`${review.rating} out of 5 stars`} className={styles.stars}>{Array.from({ length: 5 }, (_, index) => <span key={index} aria-hidden="true" className={styles.star} style={{ "--fill": `${Math.max(0, Math.min(1, review.rating - index)) * 100}%` } as CSSProperties}>★</span>)}</div>
      {review.body?.trim() ? <blockquote>{review.body.trim()}</blockquote> : null}
      <footer>{review.user.avatar ? <img src={review.user.avatar} alt="" referrerPolicy="no-referrer" /> : <span className={styles.avatarFallback} aria-hidden="true">{review.user.name.trim().slice(0, 1).toUpperCase()}</span>}<div><strong>{review.user.name}</strong><small>{review.purchaseType === "beat" ? "Beat Store" : "Distribution"} · Verified customer</small></div></footer>
    </article>)}
      </div>
    </div>
  </section>;
}
