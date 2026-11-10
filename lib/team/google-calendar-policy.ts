import { createHash } from "node:crypto";

// Google accepts base32hex characters (0-9, a-v); the brand spelling contains y.
export const googleEventId = (id: string) => `hmn${createHash("sha256").update(id).digest("hex")}`;
export const googleConferenceRequestId = (event: { id: string; googleEventId?: string | null }) => googleEventId(`${event.googleEventId || googleEventId(event.id)}:meet`);
export function googleEventBody(event: {
  id: string; title: string; startsAt: Date; endsAt: Date | null; version?: number; googleEventId?: string | null;
  client: { name: string; email: string; phone: string };
  assignee: { user: { name: string; email: string } };
  consultation?: { interests: string[]; otherRequirement: string } | null;
}, createConference = false) {
  const savedPurpose = event.consultation?.interests.map(value => value.replaceAll("_", " ").toLowerCase()).join(", ") || event.title;
  const purpose = savedPurpose.startsWith(`${event.client.name} — `) ? savedPurpose.slice(event.client.name.length + 3) : savedPurpose;
  const attendees = [...new Set([event.client.email, event.assignee.user.email].map(value => value.trim().toLowerCase()).filter(Boolean))];
  return {
    summary: `${event.client.name} — ${purpose}`.slice(0, 250),
    description: ["HYMN consultation", `Client: ${event.client.name}`, `Purpose: ${purpose}`, `Phone: ${event.client.phone || "Not supplied"}`, `HYMN representative: ${event.assignee.user.name}`, event.consultation?.otherRequirement ? `Customer requirements: ${event.consultation.otherRequirement}` : "", "Contact HYMN to request a different time."].filter(Boolean).join("\n"),
    start: { dateTime: event.startsAt.toISOString(), timeZone: "Asia/Kolkata" },
    end: { dateTime: (event.endsAt || new Date(event.startsAt.getTime() + 1800000)).toISOString(), timeZone: "Asia/Kolkata" },
    attendees: attendees.map(email => ({ email })),
    guestsCanInviteOthers: false, guestsCanModify: false,
    extendedProperties: { private: { hymnEventId: event.id } },
    ...(createConference ? { conferenceData: { createRequest: { requestId: googleConferenceRequestId(event), conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {})
  };
}

export function safeMeetUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "meet.google.com" ? url.href : null; } catch { return null; }
}
