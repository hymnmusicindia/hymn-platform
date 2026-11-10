import { z } from "zod";

export const meetingSchema = z.object({
  requestKey: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  attendees: z.array(z.string().trim().email().max(320).transform(value => value.toLowerCase())).min(1).max(20).transform(values => [...new Set(values)].sort()),
  startsAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(15).max(240).default(30),
  description: z.string().trim().max(5000).default(""),
});

export function googleMeetingBody(event: {
  id: string; title: string; startsAt: Date; endsAt: Date | null;
  meetingAttendees: string[]; meetingDescription: string;
}) {
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return {
    summary: event.title,
    description: escape(event.meetingDescription),
    start: { dateTime: event.startsAt.toISOString(), timeZone: "Asia/Kolkata" },
    end: { dateTime: (event.endsAt || new Date(event.startsAt.getTime() + 1800000)).toISOString(), timeZone: "Asia/Kolkata" },
    attendees: event.meetingAttendees.map(email => ({ email })),
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    guestsCanSeeOtherGuests: false,
    extendedProperties: { private: { hymnEventId: event.id } },
  };
}
