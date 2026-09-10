import { normalizeDireNoteContentType } from "@/lib/direnote-config";

export type ContentIdEligibility = {
  eligible: boolean;
  ownership: string;
  reason: string;
};

/** Canonical ownership rule shared by the form, API validation and DireNote. */
export function getContentIdEligibility(contentOwnership: unknown): ContentIdEligibility {
  const ownership = normalizeDireNoteContentType(contentOwnership);
  const eligible = ownership === "Original/Exclusive Licensed";
  return {
    eligible,
    ownership,
    reason: eligible
      ? "This release is eligible for Content ID."
      : ownership
        ? "Content ID is available only for original or exclusively licensed content."
        : "Select content ownership to check Content ID eligibility."
  };
}

export function assertContentIdEligibility(contentOwnership: unknown, requested: unknown) {
  const eligibility = getContentIdEligibility(contentOwnership);
  if (requested === true && !eligibility.eligible) {
    throw new Error("Content ID is available only for original or exclusively licensed content.");
  }
  return eligibility;
}
