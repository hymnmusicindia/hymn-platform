import { z } from "zod";

export const GROWTH_COOKIE = "hymn_growth_visitor";
export const GROWTH_COOKIE_SECONDS = 60 * 60 * 24 * 30;
export const clientGrowthEvents = ["landing_viewed", "distribution_viewed", "pricing_viewed", "primary_cta_clicked", "whatsapp_clicked", "signup_started"] as const;
export const clientGrowthSchema = z.object({
  event: z.enum(clientGrowthEvents),
  id: z.string().uuid(),
  url: z.string().max(4096),
  referrer: z.string().max(2048).optional()
}).strict();

export type GrowthTouch = { landing_page: string; original_referrer: string; seen_at: string } & Partial<Record<"utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term" | "ref" | "campaign_id", string>>;
export function growthTouch(rawUrl: string, rawReferrer = "", now = new Date()): GrowthTouch {
  const url = new URL(rawUrl, "https://hymn.invalid");
  const result: GrowthTouch = { landing_page: url.pathname.slice(0, 300), original_referrer: "", seen_at: now.toISOString() };
  try { result.original_referrer = new URL(rawReferrer).hostname.slice(0, 200); } catch { /* No external referrer. */ }
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "campaign_id"] as const) {
    const value = url.searchParams.get(key)?.trim().slice(0, 100);
    // Campaign identifiers only. Never retain emails, query strings, tokens or private URLs.
    if (value && /^[a-zA-Z0-9 _.-]+$/.test(value)) result[key] = value;
  }
  return result;
}
export function hasCampaign(touch: GrowthTouch) { return Boolean(touch.utm_source || touch.utm_campaign || touch.ref || touch.campaign_id); }
export function safeCampaignPath(value: string) {
  return ["/", "/distribution", "/first-release", "/first-release-free", "/contact", "/partnership-program"].includes(value);
}
export const campaignSchema = z.object({
  name: z.string().trim().min(2).max(120), channel: z.string().trim().min(1).max(60),
  slug: z.string().regex(/^[a-z0-9_-]{2,80}$/), status: z.enum(["draft", "active", "paused", "completed"]),
  landingPage: z.string().refine(safeCampaignPath, "Choose a supported public landing page."),
  source: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), medium: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  content: z.string().regex(/^[a-zA-Z0-9_-]{0,80}$/).default(""),
  budgetCents: z.number().int().min(0).max(100000000),
  notes: z.string().max(3000).default("")
});
export function campaignLink(campaign: { landingPage: string; slug: string; source: string; medium: string; content: string }, origin: string) {
  if (!safeCampaignPath(campaign.landingPage)) throw new Error("Unsupported campaign destination.");
  const url = new URL(campaign.landingPage, origin);
  url.searchParams.set("utm_source", campaign.source); url.searchParams.set("utm_medium", campaign.medium);
  url.searchParams.set("utm_campaign", campaign.slug); if (campaign.content) url.searchParams.set("utm_content", campaign.content);
  return url.toString();
}
