import { z } from "zod";
import { ENGINEER_GENRES, ENGINEER_SPECIALTIES } from "@/lib/engineer-applications";

const link = z.string().trim().max(1000).url().refine(value => value.startsWith("https://"), "Use an HTTPS link.").or(z.literal(""));
const imageLink = z.string().trim().max(1000).url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
}, "Use an HTTPS image link.").or(z.literal(""));
export const studioProfileSchema = z.object({
  professionalName: z.string().trim().min(2).max(120),
  bio: z.string().trim().min(20).max(320),
  profilePhotoUrl: imageLink,
  banner: imageLink,
  instagram: link,
  youtube: link,
  specialties: z.array(z.enum(ENGINEER_SPECIALTIES)).min(1).max(4),
  genres: z.array(z.enum(ENGINEER_GENRES)).min(1).max(5),
}).strict();
export type StudioProfileInput = z.infer<typeof studioProfileSchema>;
