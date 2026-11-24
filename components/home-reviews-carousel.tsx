"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BadgeCheck, Quote } from "lucide-react";
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
  const root = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [inView, setInView] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const direction = useRef(1);
  const touchUntil = useRef(0);
  const paused = hovered || focused || pinned || playing || reducedMotion || !inView;
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(media.matches);
    updateMotion(); media.addEventListener('change', updateMotion);
    const observer = new IntersectionObserver(entries => setInView(Boolean(entries[0]?.isIntersecting)), { threshold: .1 });
    if (viewport.current) observer.observe(viewport.current);
    const release = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setPinned(false); setActive(null); } };
    document.addEventListener('pointerdown', release);
    return () => { media.removeEventListener('change', updateMotion); observer.disconnect(); document.removeEventListener('pointerdown', release); };
  }, []);
  useEffect(() => {
    const node = viewport.current;
    if (!node || paused) return;
    let frame = 0, previous = 0, position = node.scrollLeft, written = node.scrollLeft;
    const glide = (time: number) => {
      const elapsed = previous ? Math.min(time - previous, 40) : 0; previous = time;
      if (document.hidden || time < touchUntil.current) { position = node.scrollLeft; written = node.scrollLeft; frame = requestAnimationFrame(glide); return; }
      const limit = node.scrollWidth - node.clientWidth;
      if (Math.abs(node.scrollLeft - written) > 2) position = node.scrollLeft;
      if (limit > 0) {
        position += elapsed * .024 * direction.current;
        if (position >= limit) { position = limit; direction.current = -1; }
        if (position <= 0) { position = 0; direction.current = 1; }
        node.scrollTo({ left: position, behavior: 'instant' }); written = node.scrollLeft;
      }
      frame = requestAnimationFrame(glide);
    };
    frame = requestAnimationFrame(glide);
    return () => cancelAnimationFrame(frame);
  }, [paused, reviews.length]);
  function activate(key: string) { setActive(key); setPinned(true); }

  const byUser = new Map<number, Review>();
  for (const review of reviews) {
    if (![4, 4.5, 5].includes(review.rating)) continue;
    const current = byUser.get(review.user.id);
    if (!current || reviewPriority(review, current) < 0) byUser.set(review.user.id, review);
  }
  const items = [...byUser.values()].sort(reviewPriority);

  function cards() {
    return <div className={styles.group}><article className={styles.videoCard} data-review-active={active === 'viraj' || playing} aria-label="Video review by Viraj" onPointerEnter={event => { if (event.pointerType === 'mouse') setActive('viraj'); }} onFocus={() => setActive('viraj')} onClick={() => activate('viraj')}><ArtistVideoReview compact onPlaybackChange={setPlaying}/></article>
      {items.map(review => <article key={review.id} className={styles.card} data-review-active={active === String(review.id)} role="button" tabIndex={0} aria-pressed={active === String(review.id)} aria-label={`Review by ${review.user.name}`} onPointerEnter={event => { if (event.pointerType === 'mouse') setActive(String(review.id)); }} onFocus={() => setActive(String(review.id))} onClick={() => activate(String(review.id))} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(String(review.id)); } }}>
        <div className={styles.cardTop}><div role="img" aria-label={`${review.rating} out of 5 stars`} className={styles.stars}>{Array.from({ length: 5 }, (_, index) => <span key={index} aria-hidden="true" className={styles.star} style={{ "--fill": `${Math.max(0, Math.min(1, review.rating - index)) * 100}%` } as CSSProperties}>{'\u2605'}</span>)}</div><span className={styles.service}>{review.purchaseType === "beat" ? "Beat Store" : "Distribution"}</span></div>
        {review.body?.trim() ? <div className={styles.quote}><Quote size={20} aria-hidden="true"/><blockquote>{review.body.trim()}</blockquote></div> : <div className={styles.ratingOnly}><strong>{review.rating}<span>/ 5</span></strong><span>Customer rating</span></div>}
        <footer><span className={styles.avatarFallback} aria-hidden="true">{review.user.name.trim().slice(0, 1).toUpperCase()}{review.user.avatar&&<img src={review.user.avatar} alt="" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.style.display='none';}}/>}</span><div><strong>{review.user.name}</strong><small><BadgeCheck size={12} aria-hidden="true"/>Verified customer</small></div></footer>
      </article>)}
    </div>;
  }
  return <section ref={root} id="artist-reviews" className={`${styles.root} ${compact ? styles.compact : ''}`} aria-label="Customer reviews">
    <header className={styles.intro}><div><p className={styles.eyebrow}>THE ARTISTS HAVE THE MIC</p><h2>Real people. <span>Press play.</span></h2></div></header>
    <div ref={viewport} className={styles.viewport} data-auto-paused={paused} tabIndex={0} role="region" aria-roledescription="carousel" aria-label="Artist reviews. Hover, focus or select a review to pause." onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }} onPointerLeave={() => { setHovered(false); if (!pinned && !playing && !focused) setActive(null); }} onPointerDown={event => { if (event.pointerType === 'touch') touchUntil.current = performance.now() + 6000; }} onWheel={() => { touchUntil.current = performance.now() + 5000; }} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setFocused(false); if (!pinned && !hovered && !playing) setActive(null); } }} onKeyDown={event => { if (event.key === 'Escape') { setPinned(false); setActive(null); } if (event.target !== event.currentTarget) return; if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); event.currentTarget.scrollBy({ left: (event.key === 'ArrowRight' ? 1 : -1) * 320, behavior: reducedMotion ? 'instant' : 'smooth' }); } }}>{cards()}</div>
    <ReviewInvitation signedIn={signedIn}/>
  </section>;
}
