import { z } from "zod";

export const ENGINEER_DAWS = ["FL Studio", "Logic Pro", "Ableton Live", "Pro Tools", "Cubase", "Nuendo", "Studio One", "REAPER", "Reason", "Bitwig Studio", "GarageBand", "Cakewalk Sonar", "Cakewalk Next", "Digital Performer", "Mixcraft", "Samplitude", "Sequoia", "ACID Pro", "Tracktion Waveform", "Ardour", "LMMS", "Audition", "Fairlight (DaVinci Resolve)"] as const;
export const engineerDawsSchema = z.array(z.string().trim().min(2).max(80)).max(12).refine(values => new Set(values.map(value => value.toLowerCase())).size === values.length, "Choose each DAW only once.");
export function portfolioDaws(value: unknown): string[] {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as { daws?: unknown }).daws : undefined;
  const parsed = engineerDawsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}
