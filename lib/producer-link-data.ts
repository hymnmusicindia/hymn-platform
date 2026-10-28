import { cache } from "react";
import { listBeats, listProducerProfiles, listProducerBeatPerformance } from "@/lib/db";
import { findProducerBySlug } from "@/lib/beat-store";
import { featuredProducerBeats, producerSocialLinks } from "@/lib/producer-links";

export const getProducerLinkData = cache(async (slug: string) => {
  const [beats, profiles] = await Promise.all([listBeats(), listProducerProfiles()]);
  const result = findProducerBySlug(beats, slug, profiles);
  const profile = profiles.find(entry => entry.slug === slug && entry.active);
  if (!result || !profile) return null;
  const sales = await listProducerBeatPerformance(profile.userId);
  return {
    name: result.producer.name, slug: profile.slug, bio: profile.description,
    avatar: result.producer.avatarUrl, banner: result.producer.imageUrl,
    socials: producerSocialLinks(profile),
    beats: featuredProducerBeats(result.beats, sales, result.beats.length).map(beat => ({
      id: beat.id, title: beat.title, bpm: beat.bpm, genre: beat.genre,
      artwork: beat.coverImage, audio: beat.previewUrl || beat.fileUrl,
      mood: beat.mood, keySignature: beat.keySignature, price: beat.price,
      availableLicenses:beat.availableLicenses,generalPrice: beat.generalPrice, stemPrice: beat.stemPrice, exclusivePrice: beat.exclusivePrice
    }))
  };
});
