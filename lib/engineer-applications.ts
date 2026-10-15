import { z } from "zod";
import { engineerDawsSchema } from "@/lib/engineer-daws";

export const ENGINEER_SPECIALTIES = ["Mixing", "Mastering", "Vocal tuning", "Stem mixing", "Dolby Atmos", "Podcast audio"] as const;
export const ENGINEER_GENRES = ["Hip-Hop", "Pop", "R&B", "Punjabi", "Bollywood", "EDM", "Rock", "Indie"] as const;

export const engineerWorkSchema = z.object({
  title: z.string().trim().min(2).max(120),
  url: z.string().trim().url().max(1000).refine(value => /^https?:\/\//i.test(value), "Use a web or audio link."),
  role: z.enum([...ENGINEER_SPECIALTIES, ""]).refine(value => Boolean(value), "Choose your role in this record."),
  artist: z.string().trim().max(120).optional(),
  year: z.string().regex(/^(|19\d{2}|20\d{2})$/, "Use a four-digit year.").optional(),
  note: z.string().trim().max(400).optional(),
});
export type EngineerWork = z.infer<typeof engineerWorkSchema>;

export const engineerApplicationSchema = z.object({
  profileExtras: z.object({
    daws: engineerDawsSchema.optional(),
    photo: z.string().url().max(1000).or(z.literal("")),
    banner: z.string().url().max(1000).or(z.literal("")),
    works: z.array(engineerWorkSchema).min(1).max(8),
  }).optional(),
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
