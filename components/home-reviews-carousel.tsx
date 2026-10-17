"use client";
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import styles from "./home-reviews-carousel.module.css";
type Review = { id: number; rating: number; purchaseType: string; user: { name: string; avatar: string | null } };
export function HomeReviewsCarousel({ reviews }: { reviews: Review[] }) {
  const ref = useRef<HTMLDivElement>(null); const items = reviews.filter(r => [4, 4.5, 5].includes(r.rating));
  useEffect(() => {
    const track = ref.current;
    if (!track || items.length < 2) return;
    let interval: number | undefined;
    const stop = () => { if (interval !== undefined) window.clearInterval(interval); interval = undefined; };
    const advance = () => {
      if (track.scrollWidth <= track.clientWidth + 4) return;
      const card = track.querySelector<HTMLElement>("article");
      const gap = Number.parseFloat(window.getComputedStyle(track).columnGap || "0") || 0;
      const step = card ? card.getBoundingClientRect().width + gap : track.clientWidth;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
      track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + step, behavior: "smooth" });
    };
    const start = () => {
      stop();
      if (!document.hidden && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) interval = window.setInterval(advance, 4500);
    };
    const pause = () => stop();
    track.addEventListener("pointerenter", pause);
    track.addEventListener("pointerleave", start);
    track.addEventListener("focusin", pause);
    track.addEventListener("focusout", start);
    document.addEventListener("visibilitychange", start);
    start();
    return () => {
      stop();
      track.removeEventListener("pointerenter", pause);
      track.removeEventListener("pointerleave", start);
      track.removeEventListener("focusin", pause);
      track.removeEventListener("focusout", start);
      document.removeEventListener("visibilitychange", start);
    };
  }, [items.length]);
  if (!items.length) return null;
  return <section className={styles.root} aria-label="Highly rated HYMN customer reviews" aria-roledescription="carousel"><header><div><p>FROM THE HYMN COMMUNITY</p><h2>Real music. Real experiences.</h2></div><p className={styles.ratingNote}>4 · 4.5 · 5 star ratings</p></header><div className={styles.track} ref={ref} tabIndex={0} aria-label="Customer ratings; scroll for more" aria-live="off">{items.map(r=><article key={r.id}><div role="img" aria-label={`${r.rating} out of 5 stars`} className={styles.stars}>{Array.from({length:5},(_,index)=><span key={index} aria-hidden="true" className={styles.star} style={{"--fill":`${Math.max(0,Math.min(1,r.rating-index))*100}%`} as CSSProperties}>★</span>)}</div><footer>{r.user.avatar && <img src={r.user.avatar} alt="" referrerPolicy="no-referrer"/>}<div><strong>{r.user.name}</strong><small>{r.purchaseType === "beat" ? "Beat Store" : "Distribution"} · Verified customer</small></div></footer></article>)}</div></section>;
}
