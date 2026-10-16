"use client";
import { useRef } from "react";
import styles from "./home-reviews-carousel.module.css";
type Review = { id: number; rating: number; body: string | null; purchaseType: string; user: { name: string; avatar: string | null } };
export function HomeReviewsCarousel({ reviews }: { reviews: Review[] }) {
  const ref = useRef<HTMLDivElement>(null); const items = reviews.filter(r => r.body?.trim());
  if (!items.length) return null;
  return <section className={styles.root} aria-label="Approved customer reviews"><header><div><p>FROM THE HYMN COMMUNITY</p><h2>Real music. Real experiences.</h2></div><div><button aria-label="Previous reviews" onClick={()=>ref.current?.scrollBy({left:-360,behavior:"smooth"})}>←</button><button aria-label="Next reviews" onClick={()=>ref.current?.scrollBy({left:360,behavior:"smooth"})}>→</button></div></header><div className={styles.track} ref={ref}>{items.map(r=><article key={r.id}><div aria-label={`${r.rating} out of 5 stars`} className={styles.stars}>{"★".repeat(r.rating)}{"☆".repeat(5-r.rating)}</div><blockquote>{r.body}</blockquote><footer>{r.user.avatar && <img src={r.user.avatar} alt="" referrerPolicy="no-referrer"/>}<div><strong>{r.user.name}</strong><small>{r.purchaseType === "beat" ? "Beat Store" : "Distribution"} · Approved customer review</small></div></footer></article>)}</div></section>;
}
