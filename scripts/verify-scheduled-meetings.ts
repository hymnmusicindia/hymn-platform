import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { teamMutation, teamRead } from "../lib/team/service";
import { encryptCalendarToken, syncGoogleCalendar } from "../lib/team/google-calendar";
import { googleMeetingBody, meetingSchema } from "../lib/team/meeting-policy";
import { googleConferenceRequestId, googleEventId } from "../lib/team/google-calendar-policy";

async function main() {
  assert.equal(process.env.DATABASE_URL, "postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture");
  assert.match(googleEventId("meeting-fixture"), /^[0-9a-v]{5,1024}$/);
  assert.equal(googleEventId("meeting-fixture"), googleEventId("meeting-fixture"));
  assert.notEqual(googleEventId("meeting-fixture"), googleEventId("different-meeting"));
  assert.equal(googleConferenceRequestId({ id: "meeting-fixture" }), googleConferenceRequestId({ id: "meeting-fixture", googleEventId: googleEventId("meeting-fixture") }), "Saving the external event ID must not create another Meet request.");
  const workspace = await prisma.teamWorkspace.create({ data: { name: "Meeting fixture" } });
  async function member(owner: boolean) {
    const role = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: owner ? "Owner" : "Staff", owner, permissions: ["calendar.manage"] } });
    const user = await prisma.user.create({ data: { name: "Meeting host", email: `${randomUUID()}@fixture.invalid`, googleId: randomUUID() } });
    return prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: user.id, roleId: role.id }, include: { role: true } });
  }
  const owner = await member(true), staff = await member(false);
  const startsAt = new Date(Date.now() + 2 * 86400000).toISOString();
  const input = { requestKey: randomUUID(), title: "HYMN meeting", startsAt, durationMinutes: 30, attendees: [" Guest@example.org ", "guest@example.org"], description: "Agenda <script>do not execute</script>" };
  for (const attendees of [[], ["bad-email"], Array.from({ length: 21 }, (_, i) => `guest${i}@example.org`)]) assert.equal(meetingSchema.safeParse({ ...input, attendees }).success, false);
  for (const durationMinutes of [0, -1, 14, 241, 30.5]) assert.equal(meetingSchema.safeParse({ ...input, durationMinutes }).success, false);
  await assert.rejects(teamMutation(staff, "meeting-create", input), /workspace owner/);
  await assert.rejects(teamRead(staff, "meeting-requests", new URLSearchParams()), /workspace owner/);
  await assert.rejects(teamMutation(owner, "meeting-create", { ...input, startsAt: new Date(Date.now() - 60000).toISOString() }), /future meeting/);
  await assert.rejects(teamMutation(owner, "meeting-create", { ...input, startsAt: new Date(Date.now() + 367 * 86400000).toISOString() }), /next year/);
  const [first, repeated] = await Promise.all([teamMutation(owner, "meeting-create", input), teamMutation(owner, "meeting-create", input)]) as { id: string; version: number; googleSyncStatus: string }[];
  assert.equal(first.id, repeated.id);
  assert.equal(first.googleSyncStatus, "WAITING_CONNECTION");
  assert.equal(await prisma.teamCalendarEvent.count({ where: { workspaceId: workspace.id } }), 1);
  await assert.rejects(teamMutation(owner, "meeting-create", { ...input, title: "Different request" }), /different meeting details/);
  await assert.rejects(teamMutation(owner, "meeting-create", { ...input, requestKey: randomUUID() }), /already have a meeting/);
  let event = await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: first.id } });
  assert.deepEqual(event.meetingAttendees, ["guest@example.org"]);
  await prisma.teamCalendarEvent.update({ where: { id: event.id }, data: { notes: "PRIVATE INTERNAL NOTES" } });
  const body = googleMeetingBody(event);
  assert.equal(body.summary, input.title);
  assert.equal(body.start.timeZone, "Asia/Kolkata");
  assert.equal(Date.parse(body.end.dateTime) - Date.parse(body.start.dateTime), 1800000);
  assert.equal(body.attendees[0].email, "guest@example.org");
  assert.ok(!JSON.stringify(body).includes("PRIVATE INTERNAL NOTES"));
  assert.ok(!body.description.includes("<script>"));
  let calls = 0;
  const offline = (async () => { calls++; throw Error("No network without connection"); }) as typeof fetch;
  await syncGoogleCalendar(workspace.id, event.id, offline);
  assert.equal(calls, 0);
  await prisma.teamGoogleCalendar.create({ data: { workspaceId: workspace.id, accountEmail: "host@fixture.invalid", connectedById: owner.id, refreshTokenEncrypted: encryptCalendarToken("fixture-refresh-token") } });
  const external = new Map<string, Record<string, unknown>>();
  let failOnce = true, pendingConferenceOnce = true, creates = 0, cancellations = 0;
  const conferenceRequests = new Set<string>();
  const transport = (async (url: string | URL | Request, init?: RequestInit) => {
    calls++;
    if (String(url).includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "fixture-access-token" });
    assert.ok(String(url).includes("sendUpdates=all"));
    const payload = init?.body ? JSON.parse(String(init.body)) : null;
    if (payload?.conferenceData) conferenceRequests.add(payload.conferenceData.createRequest.requestId);
    if (failOnce) { failOnce = false; return Response.json({ error: "temporary" }, { status: 503 }); }
    if (init?.method === "DELETE") { cancellations++; return new Response(null, { status: 204 }); }
    if (init?.method === "POST") {
      assert.match(payload.id, /^[0-9a-v]{5,1024}$/, "Google event IDs must satisfy the real API character restrictions.");
      creates++;
      if (external.has(payload.id)) return Response.json({}, { status: 409 });
      external.set(payload.id, payload);
    }
    assert.equal(payload.summary, input.title);
    assert.deepEqual(payload.attendees, [{ email: "guest@example.org" }]);
    assert.ok(!String(payload.description).includes("PRIVATE INTERNAL NOTES"));
    if (pendingConferenceOnce) { pendingConferenceOnce = false; return Response.json({ conferenceData: { createRequest: { status: { statusCode: "pending" } } } }); }
    return Response.json({ hangoutLink: "https://meet.google.com/abc-defg-hij", htmlLink: "https://www.google.com/calendar/event?eid=fixture" });
  }) as typeof fetch;
  await syncGoogleCalendar(workspace.id, event.id, transport);
  event = await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(event.googleSyncStatus, "RETRY");
  assert.equal(event.googleSyncAttempts, 1);
  await teamMutation(owner, "calendar-google-retry", { id: event.id });
  await Promise.all([syncGoogleCalendar(workspace.id, event.id, transport), syncGoogleCalendar(workspace.id, event.id, transport)]);
  event = await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(event.googleSyncStatus, "RETRY", "Pending Google conference creation is polled.");
  await teamMutation(owner, "calendar-google-retry", { id: event.id });
  await syncGoogleCalendar(workspace.id, event.id, transport);
  event = await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(event.googleSyncStatus, "SYNCED");
  assert.equal(event.googleMeetUrl, "https://meet.google.com/abc-defg-hij");
  assert.equal(creates, 1, "Concurrent workers cannot duplicate invitations.");
  assert.equal(external.size, 1);
  assert.equal(conferenceRequests.size, 1, "Failed requests, pending conferences and manual retries retain one Meet request identity.");
  const countBefore = calls;
  await syncGoogleCalendar(workspace.id, event.id, transport);
  assert.equal(calls, countBefore, "A fully synchronized meeting is not resent.");
  await assert.rejects(teamMutation(owner, "meeting-cancel", { id: event.id, version: event.version + 1 }), /changed/);
  await teamMutation(owner, "meeting-cancel", { id: event.id, version: event.version });
  await syncGoogleCalendar(workspace.id, event.id, transport);
  assert.equal(cancellations, 1);
  assert.equal((await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: event.id } })).googleSyncStatus, "CANCELLED");
  const expired = await prisma.teamCalendarEvent.create({ data: { workspaceId: workspace.id, creatorId: owner.id, assigneeId: owner.id, title: "Expired offline request", kind: "MEETING", startsAt: new Date(Date.now() - 60000), meetingRequestKey: randomUUID(), meetingAttendees: ["guest@example.org"], googleSyncStatus: "WAITING_CONNECTION" } });
  const beforeExpired = calls;
  await syncGoogleCalendar(workspace.id, expired.id, transport);
  assert.equal(calls, beforeExpired, "An expired offline request must not send a retroactive invitation.");
  assert.equal((await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: expired.id } })).googleSyncStatus, "ERROR");
  const foreignWorkspace = await prisma.teamWorkspace.create({ data: { name: "Other workspace" } });
  await assert.rejects(teamMutation({ ...owner, workspaceId: foreignWorkspace.id }, "meeting-cancel", { id: event.id, version: event.version }), /revoked/);
  await prisma.teamMember.update({ where: { id: owner.id }, data: { status: "SUSPENDED" } });
  await assert.rejects(teamMutation(owner, "meeting-create", { ...input, requestKey: randomUUID() }), /revoked/);
  console.log("PASS meeting automation: owner/session scope, guest validation, IST times, offline persistence, duplicate requests, conflict checks, private-note exclusion, escaped descriptions, transient retry, concurrent sync, no resend, cancellation and expired-request suppression. Google requests were simulated.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
