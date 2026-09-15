import { permanentRedirect } from "next/navigation";

// Preserve all historical campaign, referral and UTM parameters while moving
// external traffic to the single canonical first-release experience.
export default async function FreeReleaseRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) if (typeof item === "string") query.append(key, item);
  }
  permanentRedirect(`/first-release${query.size ? `?${query.toString()}` : ""}`);
}
