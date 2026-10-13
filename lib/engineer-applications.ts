import { z } from "zod";

export const ENGINEER_SPECIALTIES = ["Mixing", "Mastering", "Vocal tuning", "Stem mixing", "Dolby Atmos", "Podcast audio"] as const;
export const ENGINEER_GENRES = ["Hip-Hop", "Pop", "R&B", "Punjabi", "Bollywood", "EDM", "Rock", "Indie"] as const;

export const engineerApplicationSchema = z.object({
  professionalName: z.string().trim().min(2).max(120),
  bio: z.string().trim().min(20).max(320),
  specialties: z.array(z.enum(ENGINEER_SPECIALTIES)).min(1).max(4),
  genres: z.array(z.enum(ENGINEER_GENRES)).min(1).max(5),
  portfolioUrl: z.string().trim().url().max(1000),
  instagramUrl: z.union([z.string().trim().url().max(1000), z.literal("")]).optional(),
  experienceLevel: z.enum(["STARTING", "WORKING", "ESTABLISHED"]),
  startingPrice: z.number().finite().min(499).max(100000),
  turnaroundDays: z.number().int().min(1).max(30),
});

export type EngineerApplicationInput = z.infer<typeof engineerApplicationSchema>;

export function engineerSlug(name: string, userId: number) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "engineer";
  return `${base}-${userId}`;
}
