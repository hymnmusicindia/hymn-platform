import Link from "next/link";
import { notFound } from "next/navigation";
import { findProducerBySlug } from "@/lib/beat-store";
import { listBeats, listProducerProfiles } from "@/lib/db";
import { ProducerBeatGrid } from "@/components/producer-beat-grid";
import styles from "./storefront.module.css";

export const dynamic = "force-dynamic";

export default async function ProducerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [beats, profiles] = await Promise.all([listBeats(), listProducerProfiles()]);
  const result = findProducerBySlug(beats, slug, profiles);
  if (!result) notFound();
  const { producer, beats: producerBeats } = result;
  return <main className={`shell ${styles.page}`}>
    <Link href="/beat-store" className={styles.back}>&larr; Beat store</Link>
    <header className={styles.hero}>
      <img src={producer.imageUrl} alt="" className={styles.cover}/>
      <div className={styles.identity}>
        <img src={producer.avatarUrl} alt="" className={styles.avatar}/>
        <div><span className={styles.eyebrow}>PRODUCER STOREFRONT</span><h1>{producer.name}</h1><p className={styles.handle}>@{producer.slug}</p></div>
        <div className={styles.count}><strong>{producerBeats.length}</strong><span>Beats live</span></div>
      </div>
      {(producer.story || producer.genreIdentity) && <div className={styles.about}><p>{producer.story || producer.genreIdentity}</p></div>}
    </header>
    <section className={styles.catalog} aria-label={`${producer.name}'s beats`}>
      <div className={styles.heading}><h2>Beats by {producer.name}</h2><span>{producerBeats.length} available</span></div>
      <ProducerBeatGrid beats={producerBeats}/>
    </section>
  </main>;
}
