import assert from "node:assert/strict";
import {
  CONSULTATION_INTERESTS,
  CONSULTATION_STATUSES,
  consultationPhoneDisplay,
  consultationSlotsForMember,
  expertiseScore,
  isConsultationSlotAvailable,
  selectConsultationAssignee
} from "../lib/consultation-domain";
import type { RecurringHours } from "../lib/team/availability-rules";

const preferences = {
  workAvailability: {
    weeklyMinutes: 180,
    leave: {},
    plans: {},
    recurring: {
      enabled: true,
      assignOnlyWhileActive: false,
      restrictOverrides: false,
      slots: [{ day: 0, start: 540, end: 720 }]
    } satisfies RecurringHours
  }
};
const monday = new Date("2026-11-09T03:30:00.000Z");
const busy = [{ kind: "CALL", startsAt: new Date("2026-11-09T04:30:00.000Z"), endsAt: null }];

assert.deepEqual(CONSULTATION_INTERESTS.map(item => item.id), ["DISTRIBUTION", "BEAT_SALES", "BEAT_PURCHASE", "BECOME_ENGINEER", "MIX_MASTER", "PLAYLIST_CURATION", "OTHER"]);
assert.equal(CONSULTATION_STATUSES.length, 10);
assert.equal(consultationPhoneDisplay("+919876543210"), true);
assert.equal(consultationPhoneDisplay("9876543210"), false);
assert.equal(isConsultationSlotAvailable(preferences, monday, busy, new Date("2026-11-09T02:00:00.000Z")), true);
assert.equal(isConsultationSlotAvailable(preferences, new Date("2026-11-09T04:30:00.000Z"), busy, new Date("2026-11-09T02:00:00.000Z")), false, "Adjacent overlapping calendar call is unavailable.");
assert.equal(isConsultationSlotAvailable(preferences, new Date("2026-11-09T08:30:00.000Z"), [], new Date("2026-11-09T02:00:00.000Z")), false, "Slots outside declared working hours are unavailable.");
assert.deepEqual(consultationSlotsForMember(preferences, busy, monday, new Date("2026-11-09T05:30:00.000Z")), [monday, new Date("2026-11-09T04:00:00.000Z"), new Date("2026-11-09T05:00:00.000Z")], "Only clear half-hour slots inside work hours are offered.");

const candidates = [
  { id: "mix", name: "Mix", jobTitle: "Mixing Engineer", department: "Audio", responsibilities: "", preferences: {}, load: 1, lastAssignedAt: 1 },
  { id: "artist", name: "Artist", jobTitle: "Artist Growth", department: "Distribution", responsibilities: "", preferences: {}, load: 0, lastAssignedAt: 2 },
  { id: "other", name: "Other", jobTitle: "Team member", department: "", responsibilities: "", preferences: {}, load: 1, lastAssignedAt: 3 }
];
assert.ok(expertiseScore(candidates[0], ["MIX_MASTER"]) > expertiseScore(candidates[1], ["MIX_MASTER"]));
assert.equal(selectConsultationAssignee(candidates, ["MIX_MASTER"])?.id, "mix", "Expertise takes precedence when available.");
assert.equal(selectConsultationAssignee(candidates, ["OTHER"])?.id, "artist", "Fair workload sorting breaks equally scored candidates.");
assert.equal(selectConsultationAssignee([], []), null);

console.log("Consultation categories, statuses, phone formatting, working-hours slots, overlap prevention, and fair expertise routing passed.");
