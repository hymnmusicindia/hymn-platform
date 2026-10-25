"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { BadgeCheck, Pause, Play, Quote } from "lucide-react";
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
  const [paused, setPaused] = useState(false);

  const byUser = new Map<number, Review>();
  for (const review of reviews) {
    if (![4, 4.5, 5].includes(review.rating)) continue;
    const current = byUser.get(review.user.id);
    if (!current || reviewPriority(review, current) < 0) byUser.set(review.user.id, review);
  }
  const items = [...byUser.values()].sort(reviewPriority);
  if (!items.length) return null;
  const moving = items.length > 1;
  const duration = Math.max(40, items.length * 16);

  function cards(duplicate = false) {
    return <div className={styles.group} aria-hidden={duplicate || undefined} inert={duplicate || undefined}>
      {items.map(review => <article key={review.id} className={styles.card} aria-label={`Review by ${review.user.name}`}>
        <div className={styles.cardTop}><div role="img" aria-label={`${review.rating} out of 5 stars`} className={styles.stars}>{Array.from({ length: 5 }, (_, index) => <span key={index} aria-hidden="true" className={styles.star} style={{ "--fill": `${Math.max(0, Math.min(1, review.rating - index)) * 100}%` } as CSSProperties}>{'\u2605'}</span>)}</div><span className={styles.service}>{review.purchaseType === "beat" ? "Beat Store" : "Distribution"}</span></div>
        {review.body?.trim() ? <div className={styles.quote}><Quote size={20} aria-hidden="true"/><blockquote>{review.body.trim()}</blockquote></div> : <div className={styles.ratingOnly}><strong>{review.rating}<span>/ 5</span></strong><span>Customer rating</span></div>}
        <footer><span className={styles.avatarFallback} aria-hidden="true">{review.user.name.trim().slice(0, 1).toUpperCase()}{review.user.avatar&&<img src={review.user.avatar} alt="" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.style.display='none';}}/>}</span><div><strong>{review.user.name}</strong><small><BadgeCheck size={12} aria-hidden="true"/>Verified customer</small></div></footer>
      </article>)}
    </div>;
  }
  return <section className={styles.root} aria-label="Customer reviews">
    <div className={styles.intro}><p className={styles.eyebrow}><span aria-hidden="true"/>ARTIST REVIEWS</p><h2>Real artists.<br/><span>Real experiences.</span></h2><p className={styles.summary}>In their own words. From their own journey.</p>{moving&&<button type="button" className={styles.motionControl} aria-pressed={paused} onClick={()=>setPaused(value=>!value)}>{paused?<Play size={13} aria-hidden="true"/>:<Pause size={13} aria-hidden="true"/>}{paused?'Resume reviews':'Pause reviews'}</button>}</div>
    <div className={styles.viewport} tabIndex={0} role="region" aria-label="Artist reviews. Hover or focus here to pause." aria-live="off">
      <div className={styles.track} data-moving={moving} data-paused={paused} style={{"--review-duration":`${duration}s`} as CSSProperties}>{cards()}{moving&&cards(true)}</div>
    </div>
  </section>;
}
