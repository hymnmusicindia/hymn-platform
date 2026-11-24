"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Quote } from "lucide-react";
import styles from "./home-reviews-carousel.module.css";
import { ArtistVideoReview } from "./artist-video-review";
import { ReviewInvitation } from "./review-invitation";

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

export function HomeReviewsCarousel({ reviews, compact = false, signedIn = false }: { reviews: Review[]; compact?: boolean; signedIn?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ previous: false, next: false });
  function updatePosition() { const node = viewport.current; if (node) setPosition({ previous: node.scrollLeft > 2, next: node.scrollLeft + node.clientWidth < node.scrollWidth - 2 }); }
  useEffect(() => { const node = viewport.current; if (!node) return; const observer = new ResizeObserver(updatePosition); observer.observe(node); updatePosition(); return () => observer.disconnect(); }, [reviews.length]);
  function move(direction: number) { const node = viewport.current; if (!node) return; const card = node.firstElementChild?.firstElementChild; const distance = (card?.getBoundingClientRect().width || 320) + 18; node.scrollBy({ left: direction * distance, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }

  const byUser = new Map<number, Review>();
  for (const review of reviews) {
    if (![4, 4.5, 5].includes(review.rating)) continue;
    const current = byUser.get(review.user.id);
    if (!current || reviewPriority(review, current) < 0) byUser.set(review.user.id, review);
  }
  const items = [...byUser.values()].sort(reviewPriority);

  function cards() {
    return <div className={styles.group}><article className={styles.videoCard} aria-label="Video review by Viraj"><ArtistVideoReview compact/></article>
      {items.map(review => <article key={review.id} className={styles.card} aria-label={`Review by ${review.user.name}`}>
        <div className={styles.cardTop}><div role="img" aria-label={`${review.rating} out of 5 stars`} className={styles.stars}>{Array.from({ length: 5 }, (_, index) => <span key={index} aria-hidden="true" className={styles.star} style={{ "--fill": `${Math.max(0, Math.min(1, review.rating - index)) * 100}%` } as CSSProperties}>{'\u2605'}</span>)}</div><span className={styles.service}>{review.purchaseType === "beat" ? "Beat Store" : "Distribution"}</span></div>
        {review.body?.trim() ? <div className={styles.quote}><Quote size={20} aria-hidden="true"/><blockquote>{review.body.trim()}</blockquote></div> : <div className={styles.ratingOnly}><strong>{review.rating}<span>/ 5</span></strong><span>Customer rating</span></div>}
        <footer><span className={styles.avatarFallback} aria-hidden="true">{review.user.name.trim().slice(0, 1).toUpperCase()}{review.user.avatar&&<img src={review.user.avatar} alt="" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.style.display='none';}}/>}</span><div><strong>{review.user.name}</strong><small><BadgeCheck size={12} aria-hidden="true"/>Verified customer</small></div></footer>
      </article>)}
    </div>;
  }
  return <section id="artist-reviews" className={`${styles.root} ${compact ? styles.compact : ''}`} aria-label="Customer reviews">
    <header className={styles.intro}><div><p className={styles.eyebrow}>THE ARTISTS HAVE THE MIC</p><h2>Real people. <span>Press play.</span></h2></div><div className={styles.controls}><button type="button" aria-label="Previous artist review" disabled={!position.previous} onClick={() => move(-1)}><ArrowLeft size={18}/></button><button type="button" aria-label="Next artist review" disabled={!position.next} onClick={() => move(1)}><ArrowRight size={18}/></button></div></header>
    <div ref={viewport} className={styles.viewport} tabIndex={0} role="region" aria-roledescription="carousel" aria-label="Artist reviews. Swipe or use the arrows to explore." onScroll={updatePosition} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1); } }}>{cards()}</div>
    <ReviewInvitation signedIn={signedIn}/>
  </section>;
}
