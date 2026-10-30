/** Sections organize existing modules; keys, destinations and permissions stay with each module. */
export function sectionItems<T>(items: readonly T[], sectionFor: (item: T) => string) {
  const sections = new Map<string, T[]>();
  for (const item of items) {
    const section = sectionFor(item);
    sections.set(section, [...(sections.get(section) ?? []), item]);
  }
  return [...sections].map(([label, items]) => ({ label, items }));
}

const adminSections: Record<string, string[]> = {
  Overview: ["overview", "notifications", "analytics"],
  Distribution: ["manual-catalogue", "releases", "delivery", "updates", "fraud", "contracts", "managed-services"],
  Finance: ["revenue", "royalties", "earnings-entry", "reconciliation", "kyc"],
  "Customers & growth": ["users", "artists", "client-cards-admin", "contributors-admin", "referrals-admin", "growth", "promotions", "campaign-redemptions", "playlist-reviews", "timed-playlists", "newsletter", "leads-admin"],
  "Marketplace & Studio": ["producers", "operations", "reviews", "studio-admin"],
  "Platform & team": ["content", "support", "audit-admin", "email-admin", "webhooks-admin", "team", "activity", "integrations", "settings"],
};
export const adminSectionFor = (key: string) => Object.entries(adminSections).find(([, keys]) => keys.includes(key))?.[0] ?? "Platform & team";
export const adminModuleKey = (key?: string) => ({ "distribution-queue": "releases", "delivery-failed": "releases", payments: "revenue", producers: "operations" } as Record<string, string>)[key || ""] || key;

const teamSections: Record<string, string[]> = {
  Home: ["overview"],
  "Work-station": ["work-station", "work", "tasks", "projects", "approvals", "calendar", "availability"],
  "Contacts & growth": ["contacts", "acquisition", "crm", "customer-calls", "referral"],
  Messages: ["inbox", "chat", "emails"],
  "Quality & reports": ["creator-applications", "release-qc", "reports"],
  Leadership: ["leadership"],
  "Team & access": ["directory", "audit", "settings"],
};
export const teamSectionFor = (key: string) => Object.entries(teamSections).find(([, keys]) => keys.includes(key))?.[0] ?? "Team & access";
