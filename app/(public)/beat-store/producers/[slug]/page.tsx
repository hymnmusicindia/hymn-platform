import { cache } from "react";
import { publicPageMetadata, profileStructuredData, jsonLd, privateRobots } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findProducerBySlug } from "@/lib/beat-store";
import { listBeats, listProducerProfiles } from "@/lib/db";
import { ProducerBeatGrid } from "@/components/producer-beat-grid";
import styles from "./storefront.module.css";

export const dynamic = "force-dynamic";
const getProducer=cache(async(slug:string)=>{const [beats,profiles]=await Promise.all([listBeats(),listProducerProfiles()]);return findProducerBySlug(beats,slug,profiles);});
export async function generateMetadata({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params,result=await getProducer(slug);
  if(!result)return {title:'Producer unavailable',robots:privateRobots};
  return publicPageMetadata(`${result.producer.name} Beats`,result.producer.story||`Preview and license beats by ${result.producer.name} on HYMN Music. Compare formats and licence terms before you buy.`,`/beat-store/producers/${encodeURIComponent(slug)}`,result.producer.imageUrl);
}


export default async function ProducerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getProducer(slug);
  if (!result) notFound();
  const { producer, beats: producerBeats } = result;
  return <main className={`shell ${styles.page}`}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(profileStructuredData(producer.name,`/beat-store/producers/${encodeURIComponent(slug)}`,"Beat store","/beat-store"))}}/>
    <Link href="/beat-store" className={styles.back}>&larr; Beat store</Link>
    <header className={styles.hero}>
      <img src={producer.imageUrl} alt="" className={styles.cover}/>
      <div className={styles.identity}>
        <img src={producer.avatarUrl} alt="" className={styles.avatar}/>
        <div><span className={styles.eyebrow}>PRODUCER STOREFRONT</span><h1>{producer.name}</h1><p className={styles.handle}>@{producer.slug}</p><Link href={`/p/${encodeURIComponent(producer.slug)}`} className={styles.bioLink}>Links & featured beats &rarr;</Link></div>
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
