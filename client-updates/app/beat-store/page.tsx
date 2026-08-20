import { BeatStoreExperience } from "@/components/beat-store-experience";
import { listBeats, listProducerProfiles } from "@/lib/db";

export default async function BeatStorePage() {
  const [beats, producerProfiles] = await Promise.all([listBeats(), listProducerProfiles()]);

  return (
    <main className="shell py-12 sm:py-16">
      <div className="mb-8 max-w-3xl sm:mb-10">
        <span className="eyebrow">Beatstore</span>
        <h1 className="mt-4 text-3xl font-semibold sm:text-4xl lg:text-5xl" style={{ color: "var(--text)" }}>Browse beats with clarity.</h1>
        <p className="mt-4 text-sm sm:text-base" style={{ color: "var(--text-muted)" }}>
          Preview, filter, and license curated beats without losing the session momentum.
        </p>
      </div>
      <BeatStoreExperience beats={beats} producerProfiles={producerProfiles} />
    </main>
  );
}
