import { getContentIdEligibility } from "@/lib/content-id-eligibility";

export type ContentIdAccessStatus = "none" | "pending" | "approved" | "declined";
export const CONTENT_ID_REQUEST_FEE = 250;

export function normalizeContentIdAccessStatus(status?: string | null): ContentIdAccessStatus {
  const normalized = status?.trim().toLowerCase();
  return normalized === "pending" || normalized === "approved" || normalized === "declined"
    ? normalized
    : "none";
}

export function isValidYoutubeChannelUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:"
      && ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)
      && url.pathname.length > 1;
  } catch {
    return false;
  }
}

export function contentIdRequestFee(selected: boolean, status: ContentIdAccessStatus, yearlyPlusEntitled = false) {
  return selected && status !== "pending" && status !== "approved" && !yearlyPlusEntitled
    ? CONTENT_ID_REQUEST_FEE
    : 0;
}

export function shouldAutoSelectContentId(input: {
  status: ContentIdAccessStatus;
  platforms: string[];
  contentType: unknown;
}) {
  return input.status === "approved"
    && input.platforms.includes("YouTube Music")
    && getContentIdEligibility(input.contentType).eligible;
}
