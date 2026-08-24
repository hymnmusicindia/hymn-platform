import { Prisma, ReleaseStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DIRENOTE_GENRES, DIRENOTE_LANGUAGES, DIRENOTE_SUBGENRES_BY_GENRE } from "@/lib/direnote-config";

export type ReleasePrefillField = "language" | "primaryGenre" | "secondaryGenre" | "recordLabelName" | "copyrightOwner" | "publishingRights";
export type ReleasePrefillSource = "USER_DEFAULT" | "ARTIST_PROFILE" | "PREVIOUS_RELEASE" | "SYSTEM_DEFAULT";
export type ReleasePrefillSuggestion = { field: ReleasePrefillField; value: string; source: ReleasePrefillSource; confidence: "EXACT" | "HIGH_CONFIDENCE" | "SUGGESTION" };
export type ReleasePreferences = {
  defaultArtistProfileId?: number;
  preferredTitleLanguage?: string;
  preferredGenre?: string;
  preferredSubgenre?: string;
  rightsDefaults?: { compositionOwner?: string; masterRecordingOwner?: string; defaultLabelName?: string; defaultCLineName?: string; defaultPLineName?: string };
};

function objectValue(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

export async function getReleasePrefill(userId: number): Promise<{ suggestions: ReleasePrefillSuggestion[]; preferences: ReleasePreferences }> {
  const [user, previous] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { onboardingPreferences: true } }),
    prisma.release.findFirst({ where: { OR: [{ userId }, { ownerUserId: userId }], status: { notIn: [ReleaseStatus.DRAFT, ReleaseStatus.AWAITING_PAYMENT] } }, orderBy: { updatedAt: "desc" }, select: { genre: true, metadata: true } })
  ]);
  const root = objectValue(user?.onboardingPreferences);
  const previousMetadata = objectValue(previous?.metadata);
  const saved = objectValue(root.distributionPreferences as Prisma.JsonValue | undefined);
  const rights = objectValue(saved.rightsDefaults as Prisma.JsonValue | undefined);
  const preferences: ReleasePreferences = {
    defaultArtistProfileId: typeof saved.defaultArtistProfileId === "number" ? saved.defaultArtistProfileId : undefined,
    preferredTitleLanguage: text(saved.preferredTitleLanguage) || undefined,
    preferredGenre: text(saved.preferredGenre) || undefined,
    preferredSubgenre: text(saved.preferredSubgenre) || undefined,
    rightsDefaults: { compositionOwner: text(rights.compositionOwner) || undefined, masterRecordingOwner: text(rights.masterRecordingOwner) || undefined, defaultLabelName: text(rights.defaultLabelName) || undefined, defaultCLineName: text(rights.defaultCLineName) || undefined, defaultPLineName: text(rights.defaultPLineName) || undefined }
  };
  const suggestions: ReleasePrefillSuggestion[] = [];
  const add = (field: ReleasePrefillField, value: string, source: ReleasePrefillSource, confidence: ReleasePrefillSuggestion["confidence"]) => { if (value && !suggestions.some((item) => item.field === field)) suggestions.push({ field, value, source, confidence }); };
  const language = preferences.preferredTitleLanguage ?? text(previousMetadata.language);
  if ((DIRENOTE_LANGUAGES as readonly string[]).includes(language)) add("language", language, preferences.preferredTitleLanguage ? "USER_DEFAULT" : "PREVIOUS_RELEASE", preferences.preferredTitleLanguage ? "HIGH_CONFIDENCE" : "SUGGESTION");
  const genre = preferences.preferredGenre ?? (text(previousMetadata.primaryGenre) || text(previous?.genre));
  if ((DIRENOTE_GENRES as readonly string[]).includes(genre)) add("primaryGenre", genre, preferences.preferredGenre ? "USER_DEFAULT" : "PREVIOUS_RELEASE", preferences.preferredGenre ? "HIGH_CONFIDENCE" : "SUGGESTION");
  const subgenre = preferences.preferredSubgenre ?? text(previousMetadata.secondaryGenre);
  if (genre && (DIRENOTE_SUBGENRES_BY_GENRE[genre] ?? []).includes(subgenre)) add("secondaryGenre", subgenre, preferences.preferredSubgenre ? "USER_DEFAULT" : "PREVIOUS_RELEASE", preferences.preferredSubgenre ? "HIGH_CONFIDENCE" : "SUGGESTION");
  add("recordLabelName", preferences.rightsDefaults?.defaultLabelName ?? (text(previousMetadata.labelDisplayName) || text(previousMetadata.labelName) || text(previousMetadata.recordLabelName)), preferences.rightsDefaults?.defaultLabelName ? "USER_DEFAULT" : "PREVIOUS_RELEASE", "SUGGESTION");
  add("copyrightOwner", preferences.rightsDefaults?.defaultCLineName ?? preferences.rightsDefaults?.compositionOwner ?? text(previousMetadata.copyrightOwner), preferences.rightsDefaults?.compositionOwner ? "USER_DEFAULT" : "PREVIOUS_RELEASE", "SUGGESTION");
  add("publishingRights", preferences.rightsDefaults?.defaultPLineName ?? preferences.rightsDefaults?.masterRecordingOwner ?? text(previousMetadata.publishingRights), preferences.rightsDefaults?.masterRecordingOwner ? "USER_DEFAULT" : "PREVIOUS_RELEASE", "SUGGESTION");
  return { suggestions, preferences };
}
