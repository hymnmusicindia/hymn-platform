import { reservationsOverlap } from "@/lib/team/calendar-reservations";
import { withinWorkHours } from "@/lib/team/availability-rules";

export const CONSULTATION_INTERESTS = [
  { id: "DISTRIBUTION", title: "Distribution of Songs", detail: "Release your music on streaming platforms." },
  { id: "BEAT_SALES", title: "Sell Beats", detail: "Sell and license your beats." },
  { id: "BEAT_PURCHASE", title: "Purchase Beats", detail: "Find the right beat for your next project." },
  { id: "BECOME_ENGINEER", title: "Become a HYMN Engineer", detail: "Work with HYMN as an audio engineer." },
  { id: "MIX_MASTER", title: "Mixing & Mastering", detail: "Find professional mix and master support." },
  { id: "PLAYLIST_CURATION", title: "Playlist Curation", detail: "Learn about playlist consideration." },
  { id: "OTHER", title: "Other", detail: "Tell us about a different requirement." }
] as const;

export const CONSULTATION_STATUSES = [
  "NEW_LEAD",
  "UNASSIGNED",
  "ASSIGNED",
  "CALLBACK_SCHEDULED",
  "CONTACTED",
  "CONSULTATION_COMPLETED",
  "FOLLOW_UP_REQUIRED",
  "CONVERTED",
  "NOT_INTERESTED",
  "LOST"
] as const;

const expertiseTerms: Record<string, string[]> = {
  DISTRIBUTION: ["distribution", "release", "artist", "label"],
  BEAT_SALES: ["beat sales", "producer", "marketplace"],
  BEAT_PURCHASE: ["beat purchase", "beat", "producer"],
  BECOME_ENGINEER: ["engineer", "audio"],
  MIX_MASTER: ["mix", "master", "studio"],
  PLAYLIST_CURATION: ["playlist", "curation"],
  OTHER: ["growth", "consultation", "artist"]
};

export type ConsultationAssigneeCandidate = {
  id: string;
  name: string;
  jobTitle: string;
  department: string;
  responsibilities: string;
  preferences: unknown;
  load: number;
  lastAssignedAt: number;
};

function configuredExpertise(preferences: unknown) {
  if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) return "";
  const value = (preferences as Record<string, unknown>).consultationServices;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(" ") : "";
}

export function expertiseScore(candidate: ConsultationAssigneeCandidate, interests: string[]) {
  const profile = `${candidate.jobTitle} ${candidate.department} ${candidate.responsibilities} ${configuredExpertise(candidate.preferences)}`.toLowerCase();
  return interests.reduce((score, interest) => {
    const terms = expertiseTerms[interest] ?? [];
    return score + (terms.some(term => profile.includes(term)) ? 1 : 0);
  }, 0);
}

export function selectConsultationAssignee<T extends ConsultationAssigneeCandidate>(candidates: T[], interests: string[]) {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((a, b) =>
    expertiseScore(b, interests) - expertiseScore(a, interests) ||
    a.load - b.load ||
    a.lastAssignedAt - b.lastAssignedAt ||
    a.id.localeCompare(b.id)
  );
  return sorted[0];
}

export type ConsultationReservation = { kind: string; startsAt: Date; endsAt: Date | null };

export function isConsultationSlotAvailable(preferences: unknown, startsAt: Date, reservations: ConsultationReservation[], now = new Date()) {
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  if (startsAt <= now || !withinWorkHours(preferences, startsAt, endsAt)) return false;
  return !reservations.some(event => reservationsOverlap({ kind: "CALL", startsAt, endsAt: null }, event));
}

export function consultationSlotsForMember(preferences: unknown, reservations: ConsultationReservation[], after: Date, until: Date) {
  const slots: Date[] = [];
  let candidate = new Date(Math.ceil(after.getTime() / (30 * 60_000)) * (30 * 60_000));
  const beforeFirstSlot = new Date(after.getTime() - 1);
  while (candidate.getTime() + 30 * 60_000 <= until.getTime()) {
    if (isConsultationSlotAvailable(preferences, candidate, reservations, beforeFirstSlot)) slots.push(candidate);
    candidate = new Date(candidate.getTime() + 30 * 60_000);
  }
  return slots;
}

export function consultationPhoneDisplay(phone: string) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
