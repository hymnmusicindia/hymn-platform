import { BeatStoreExperience } from "@/components/beat-store-experience";
import { listAllBeats, listProducerProfiles } from "@/lib/db";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "License Beats from HYMN Producers | HYMN Beat Store",
  description: "Preview, compare rights, and license curated beats from HYMN producers.",
  alternates: { canonical: "/beat-store" },
  openGraph: { title: "HYMN Beat Store", description: "Curated, release-ready beats with clear licensing.", url: "/beat-store" }
};


export default async function BeatStorePage() {
  const [beats, producerProfiles] = await Promise.all([listAllBeats(), listProducerProfiles()]);

  return (
    <main className="shell pb-12 pt-5 sm:pb-16 sm:pt-6">
      <BeatStoreExperience beats={beats} producerProfiles={producerProfiles} />
    </main>
  );
}

// vercel trigger 3
