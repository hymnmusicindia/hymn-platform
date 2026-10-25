import { publicPageMetadata } from "@/lib/seo";
import { BeatStoreExperience } from "@/components/beat-store-experience";
import { listBeats, listProducerProfiles } from "@/lib/db";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = publicPageMetadata("License Beats from Independent Producers", "Preview, compare rights, and license curated beats from HYMN producers.", "/beat-store");


export default async function BeatStorePage() {
  const [beats, producerProfiles] = await Promise.all([listBeats(), listProducerProfiles()]);

  return (
    <main className="beat-store-page">
      <BeatStoreExperience beats={beats} producerProfiles={producerProfiles} />
    </main>
  );
}

// vercel trigger 3
