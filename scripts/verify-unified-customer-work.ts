import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { submitConsultation } from "../lib/consultation-portal";
import { teamMutation, teamRead, teamWrite } from "../lib/team/service";
import { syncGoogleCalendar, encryptCalendarToken } from "../lib/team/google-calendar";
import { callWorkload } from "../lib/team/call-workload";
import { syncConsultationTask, routeWaitingConsultations } from "../lib/team/consultation-work";
import { safeMeetUrl } from "../lib/team/google-calendar-policy";
import { callJourney } from "../lib/team/call-journey";

async function main() {
  assert.equal(process.env.DATABASE_URL, "postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture");
  const workspace = await prisma.teamWorkspace.create({ data: { name: "Unified CRM fixture", clientCardsImportedAt: new Date() } });
  const hours = { workAvailability: { weeklyMinutes: 60, leave: {}, plans: {}, recurring: { enabled: true, assignOnlyWhileActive: false, restrictOverrides: false, slots: Array.from({ length: 7 }, (_, day) => ({ day, start: 0, end: 1440 })) } }, crm: { caller: true, callTarget: 20 } };
  async function member(name: string, owner = false, permissions = ["crm.prospects.view", "crm.outreach.manage", "calendar.manage", "calendar.view", "tasks.update", "tasks.complete"]) {
    const role = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name, owner, permissions } });
    const user = await prisma.user.create({ data: { name, email: `${name}@unified.fixture.invalid`, googleId: `unified-${name}` } });
    return prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: user.id, roleId: role.id, preferences: hours }, include: { role: true } });
  }
  const owner = await member("owner", true), first = await member("first"), second = await member("second"), viewer = await member("viewer", false, ["calendar.view"]);
  const callerById = (id: string) => id === first.id ? first : second;
  const at = new Date(Math.ceil((Date.now() + 4 * 3600000) / 1800000) * 1800000);
  const createCustomer = (name: string) => prisma.user.create({ data: { name, email: `${name}@unified.fixture.invalid`, googleId: `unified-customer-${name}` } });
  const input = (name: string, key: string, time: Date | null) => ({ idempotencyKey: key, fullName: name, dialCode: "91", phone: `98765${name === "Artist One" ? "40001" : name === "Artist Two" ? "40002" : "40003"}`, interests: ["DISTRIBUTION"], otherRequirement: "Help plan a first release.", callbackAt: time?.toISOString() || null, source: "website", campaign: "", referralUrl: "", landingPageUrl: "/consultation", referrer: "", firstTouchSource: "website", latestTouchSource: "website", utm: { source: "", medium: "", campaign: "", content: "", term: "" }, funnelEvents: [], consent: true, marketingConsent: false });
  const customer = await createCustomer("artist-one"), key = randomUUID();
  const submitted = await submitConsultation(customer.id, input("Artist One", key, at));
  assert.equal(submitted.status, "CALLBACK_SCHEDULED");
  const original = await prisma.consultationRequest.findUniqueOrThrow({ where: { id: submitted.id }, include: { task: true, calendarEvent: true } });
  assert.ok(original.taskId && original.calendarEventId);
  assert.equal(original.calendarEvent!.followUpTaskId, original.taskId);
  assert.equal(original.calendarEvent!.googleSyncStatus, "PENDING");
  assert.equal(original.task!.callPhase, "CONSULTATION");
  assert.equal((await submitConsultation(customer.id, input("Artist One", key, at))).duplicate, true);
  assert.equal(await prisma.teamTask.count({ where: { eventKey: `consultation:${original.id}:call` } }), 1);
  const [two, three] = await Promise.all([createCustomer("artist-two"), createCustomer("artist-three")]);
  const concurrent = await Promise.all([submitConsultation(two.id, input("Artist Two", randomUUID(), at)), submitConsultation(three.id, input("Artist Three", randomUUID(), at))]);
  assert.equal(concurrent.filter(row => row.status === "CALLBACK_SCHEDULED").length, 1, "A slot can only reserve each qualified caller once.");
  assert.equal(concurrent.filter(row => row.status === "UNASSIGNED").length, 1, "Overflow remains saved for allocation.");
  const pending = concurrent.find(row => row.status === "UNASSIGNED")!;
  assert.equal(await prisma.teamCalendarEvent.count({ where: { workspaceId: workspace.id, startsAt: at, status: "SCHEDULED" } }), 2);
  const loads = await teamWrite(owner, tx => callWorkload(tx, workspace.id, [first.id, second.id]));
  assert.equal(loads.get(first.id), 1); assert.equal(loads.get(second.id), 1, "Linked tasks and calendar events count once.");
  const privateProfile = await teamRead(viewer, "contact-profile", new URLSearchParams({ clientId: original.clientId })) as { upcomingEvents: unknown[] };
  assert.equal(privateProfile.upcomingEvents.length, 0, "Calendar view permission alone cannot reveal another rep's booking.");

  let task = await prisma.teamTask.findUniqueOrThrow({ where: { id: original.taskId! } });
  const caller = callerById(task.ownerId), recipient = caller.id === first.id ? second : first;
  const later = new Date(at.getTime() + 86400000);
  const scheduled = await teamMutation(caller, "call-reschedule", { id: task.id, version: task.version, startsAt: later.toISOString(), keepAssignee: true, confirmed: true, reason: "Customer agreed a later day." }) as { calendarEventId: string };
  assert.equal(scheduled.calendarEventId, original.calendarEventId, "Rescheduling updates the existing booking.");
  await assert.rejects(teamMutation(caller, "call-reschedule", { id: task.id, version: task.version, startsAt: later.toISOString(), confirmed: true, reason: "Stale browser tab." }));
  task = await prisma.teamTask.findUniqueOrThrow({ where: { id: task.id } });
  assert.equal(task.callAttempts, 0); assert.equal(task.conversationCount, 0);
  await assert.rejects(teamMutation(recipient, "call-reschedule", { id: task.id, version: task.version, startsAt: later.toISOString(), confirmed: true, reason: "Not the responsible caller." }));
  const handoffData = { taskId: task.id, version: task.version, toId: recipient.id, mode: "TRANSFER", team: "Distribution", summary: "First release planning. Customer agreed the saved time; review their requirements.", requestKey: randomUUID() };
  const handoff = await teamMutation(caller, "handoff-request", handoffData) as { id: string; version: number };
  assert.equal((await prisma.teamTask.findUniqueOrThrow({ where: { id: task.id } })).ownerId, caller.id, "Responsibility stays until acceptance.");
  assert.equal((await teamMutation(caller, "handoff-request", handoffData) as { id: string }).id, handoff.id);
  await assert.rejects(teamMutation(caller, "handoff-resolve", { id: handoff.id, version: handoff.version, action: "ACCEPT" }));
  await teamMutation(recipient, "handoff-resolve", { id: handoff.id, version: handoff.version, action: "ACCEPT" });
  assert.equal((await prisma.teamTask.findUniqueOrThrow({ where: { id: task.id } })).ownerId, recipient.id);
  assert.equal((await prisma.consultationRequest.findUniqueOrThrow({ where: { id: original.id } })).assignedMemberId, recipient.id);
  assert.equal((await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: original.calendarEventId! } })).startsAt.toISOString(), later.toISOString());
  await assert.rejects(teamMutation(recipient, "handoff-resolve", { id: handoff.id, version: handoff.version, action: "ACCEPT" }));

  let networkCalls = 0;
  await syncGoogleCalendar(workspace.id, original.calendarEventId!, (async () => { networkCalls++; throw Error("No account connected."); }) as typeof fetch);
  assert.equal(networkCalls, 0);
  assert.equal((await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: original.calendarEventId! } })).googleSyncStatus, "WAITING_CONNECTION");
  const encrypted = encryptCalendarToken("fixture-refresh-token"); assert.ok(!encrypted.includes("fixture-refresh-token"));
  await prisma.teamGoogleCalendar.create({ data: { workspaceId: workspace.id, accountEmail: "host@unified.fixture.invalid", refreshTokenEncrypted: encrypted, connectedById: owner.id } });
  const external = new Map<string, Record<string, unknown>>(); let inserts = 0, deletes = 0, failure = 0;
  const transport = (async (url: string | URL | Request, init?: RequestInit) => {
    networkCalls++;
    const address = String(url);
    if (address.includes("oauth2.googleapis.com")) return Response.json({ access_token: "fixture-access-token" });
    if (failure) return Response.json({ error: failure === 429 ? { errors: [{ reason: "userRateLimitExceeded" }] } : "simulated" }, { status: failure === 429 ? 403 : failure });
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    const eventId = new URL(address).pathname.split("/").at(-1)!;
    if (init?.method === "DELETE") { deletes++; external.delete(eventId); return new Response(null, { status: 204 }); }
    if (init?.method === "POST") {
      inserts++; const id = String(body.id); external.set(id, body);
      return Response.json({ id, hangoutLink: "https://meet.google.com/abc-defg-hij", htmlLink: "https://www.google.com/calendar/event?eid=fixture" });
    }
    if (!external.has(eventId)) return Response.json({}, { status: 404 });
    external.set(eventId, body);
    return Response.json({ id: eventId, hangoutLink: "https://meet.google.com/abc-defg-hij" });
  }) as typeof fetch;
  await Promise.all([syncGoogleCalendar(workspace.id, original.calendarEventId!, transport), syncGoogleCalendar(workspace.id, original.calendarEventId!, transport)]);
  let event = await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: original.calendarEventId! } });
  assert.equal(event.googleSyncStatus, "SYNCED"); assert.equal(inserts, 1, "Concurrent workers create one external event.");
  assert.ok(event.googleMeetUrl?.startsWith("https://meet.google.com/"));
  const payload = external.get(event.googleEventId!)!;
  assert.match(String(payload.summary), /Artist One.*distribution/i);
  assert.match(String(payload.description), /Help plan a first release/);
  assert.ok(!String(payload.description).includes("Customer agreed a later day"), "Internal scheduling notes never enter the public invitation.");
  const identity = event.googleEventId;
  task = await prisma.teamTask.findUniqueOrThrow({ where: { id: task.id } });
  await teamMutation(recipient, "call-reschedule", { id: task.id, version: task.version, startsAt: new Date(later.getTime() + 3600000).toISOString(), keepAssignee: true, confirmed: true, reason: "Customer requested one hour later." });
  await syncGoogleCalendar(workspace.id, event.id, transport);
  assert.equal((await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: event.id } })).googleEventId, identity); assert.equal(inserts, 1);

  await teamMutation(owner, "calendar-google-retry", { id: event.id }); failure = 503;
  await syncGoogleCalendar(workspace.id, event.id, transport);
  event = await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(event.googleSyncStatus, "RETRY"); assert.equal(event.status, "SCHEDULED");
  await teamMutation(owner, "calendar-google-retry", { id: event.id }); failure = 429;
  await syncGoogleCalendar(workspace.id, event.id, transport);
  assert.equal((await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: event.id } })).googleSyncStatus, "RETRY", "Google 403 rate limits retry without requiring a new account connection.");
  await teamMutation(owner, "calendar-google-retry", { id: event.id }); failure = 403;
  await syncGoogleCalendar(workspace.id, event.id, transport);
  assert.equal((await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: event.id } })).googleSyncStatus, "ERROR");
  failure = 0; await teamMutation(owner, "calendar-google-retry", { id: event.id });
  await syncGoogleCalendar(workspace.id, event.id, transport);
  assert.equal(safeMeetUrl("https://meet.google.com.attacker.invalid/x"), null);
  assert.equal(safeMeetUrl("javascript:alert(1)"), null);

  const currentConsultation = await prisma.consultationRequest.findUniqueOrThrow({ where: { id: original.id } });
  await assert.rejects(teamMutation(recipient, "consultations", { action: "note", id: original.id, version: currentConsultation.version - 1, message: "Stale note." }));
  await teamMutation(recipient, "consultations", { action: "note", id: original.id, version: currentConsultation.version, message: "Review the customer needs before calling." });
  assert.equal((await prisma.teamTask.findUniqueOrThrow({ where: { id: task.id } })).callAttempts, 0);

  const basic = await prisma.teamClient.create({ data: { workspaceId: workspace.id, ownerId: first.id, name: "First conversation customer", phone: "+919876540009" } });
  const createdCall = await teamMutation(first, "customer-call-create", { clientId: basic.id, purpose: "Understand first release requirements", phase: "FIRST_CONVERSATION", startsAt: new Date(at.getTime() + 2 * 3600000).toISOString(), keepAssignee: false, confirmed: false, reason: "Customer asked for a preparation call.", requestKey: randomUUID() }) as { id: string; calendarEventId: string };
  let firstTask = await prisma.teamTask.findUniqueOrThrow({ where: { id: createdCall.id } });
  const firstCaller = callerById(firstTask.ownerId);
  const started = await teamMutation(firstCaller, "workstation-start", { taskId: firstTask.id, requestKey: randomUUID() }) as { id: string };
  assert.equal(started.id, firstTask.id);
  firstTask = await prisma.teamTask.findUniqueOrThrow({ where: { id: firstTask.id } });
  const activity = (firstTask.followUpContext as { workActivity: { id: string } }).workActivity;
  await teamMutation(firstCaller, "workstation-finish", { id: firstTask.id, version: firstTask.version, activityId: activity.id, outcome: "NO_ANSWER" });
  firstTask = await prisma.teamTask.findUniqueOrThrow({ where: { id: firstTask.id } });
  assert.equal(firstTask.callAttempts, 1); assert.equal(firstTask.conversationCount, 0); assert.equal(firstTask.callPhase, "FIRST_CONVERSATION");
  assert.equal(callJourney(firstTask.followUpContext).phase, "FIRST_CONVERSATION");
  assert.equal((await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: createdCall.calendarEventId } })).googleSyncStatus, "NOT_REQUIRED");
  const firstView = await teamRead(firstCaller, "workstation", new URLSearchParams({ bucket: "assigned", phase: "FIRST_CONVERSATION" })) as { items: { id: string }[] };
  assert.ok(firstView.items.some(row => row.id === firstTask.id));

  await teamMutation(firstCaller, "workstation-start", { taskId: firstTask.id, requestKey: randomUUID() });
  firstTask = await prisma.teamTask.findUniqueOrThrow({ where: { id: firstTask.id } });
  await teamMutation(firstCaller, "workstation-finish", { id: firstTask.id, version: firstTask.version, activityId: (firstTask.followUpContext as { workActivity: { id: string } }).workActivity.id, outcome: "FOLLOW_UP", draft: { notes: "Discussed the release plan and agreed the next preparation steps.", needs: "Artwork review", commitments: "Review release checklist", nextAction: "Prepare the release files", services: [], checklist: [] } });
  firstTask = await prisma.teamTask.findUniqueOrThrow({ where: { id: firstTask.id } });
  assert.equal(firstTask.callAttempts, 2, "A completed conversation increments once, including the legacy outcome adapter.");
  assert.equal(firstTask.conversationCount, 1); assert.equal(firstTask.callPhase, "FOLLOW_UP");
  const helper = firstCaller.id === first.id ? second : first;
  const help = await teamMutation(firstCaller, "handoff-request", { taskId: firstTask.id, version: firstTask.version, toId: helper.id, mode: "HELP", summary: "Review the artwork requirements and share the correct preparation steps.", requestKey: randomUUID() }) as { id: string; version: number };
  await teamMutation(helper, "handoff-resolve", { id: help.id, version: help.version, action: "ACCEPT" });
  firstTask = await prisma.teamTask.findUniqueOrThrow({ where: { id: firstTask.id } });
  assert.equal(firstTask.ownerId, firstCaller.id); assert.ok(firstTask.collaboratorIds.includes(helper.id));
  const helping = await teamRead(helper, "workstation", new URLSearchParams({ bucket: "assigned" })) as { items: { id: string }[] };
  assert.ok(helping.items.some(row => row.id === firstTask.id), "Accepted help remains visible in the specialist's daily work.");
  const helperDetail = await teamRead(helper, "workstation-activity", new URLSearchParams({ id: firstTask.id })) as { task: { id: string } };
  assert.equal(helperDetail.task.id, firstTask.id);
  await teamMutation(helper, "comments", { id: firstTask.id, body: "Artwork reviewed. Shared the required dimensions and next steps." });
  const staleHandoff = await teamMutation(firstCaller, "handoff-request", { taskId: firstTask.id, version: firstTask.version, toId: helper.id, mode: "TRANSFER", summary: "Continue the agreed preparation work once you accept responsibility.", requestKey: randomUUID() }) as { id: string; version: number };
  await prisma.teamTask.update({ where: { id: firstTask.id }, data: { description: "The customer changed their requirement.", version: { increment: 1 } } });
  await assert.rejects(teamMutation(helper, "handoff-resolve", { id: staleHandoff.id, version: staleHandoff.version, action: "ACCEPT" }), /changed after/);
  await teamMutation(firstCaller, "handoff-resolve", { id: staleHandoff.id, version: staleHandoff.version, action: "CANCEL" });
  firstTask = await prisma.teamTask.update({ where: { id: firstTask.id }, data: { status: "BLOCKED", followUpContext: { ...(firstTask.followUpContext as object), noAnswerAttempts: 3 }, version: { increment: 1 } } });
  await assert.rejects(teamMutation(firstCaller, "call-reschedule", { id: firstTask.id, version: firstTask.version, startsAt: new Date(at.getTime() + 3 * 86400000).toISOString(), keepAssignee: true, confirmed: false, reason: "Try again without a supervisor." }), /supervisor/i);

  // An event changed while Google responds must remain queued for the new revision.
  await teamMutation(owner, "calendar-google-retry", { id: event.id });
  let changedDuringSync = false;
  const racingTransport = (async (url: string | URL | Request, init?: RequestInit) => {
    const response = await transport(url, init);
    if (!changedDuringSync && init?.method === "PATCH") {
      changedDuringSync = true;
      await prisma.teamCalendarEvent.update({ where: { id: event.id }, data: { startsAt: new Date(later.getTime() + 2 * 3600000), scheduleRevision: { increment: 1 } } });
    }
    return response;
  }) as typeof fetch;
  await syncGoogleCalendar(workspace.id, event.id, racingTransport);
  assert.equal((await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: event.id } })).googleSyncStatus, "PENDING");
  await syncGoogleCalendar(workspace.id, event.id, transport);
  assert.equal((await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: event.id } })).googleSyncStatus, "SYNCED");

  await prisma.consultationRequest.update({ where: { id: pending.id }, data: { preferredCallback: new Date(Date.now() - 60000) } });
  await teamWrite(owner, (tx, a) => routeWaitingConsultations(tx, a));
  assert.equal((await prisma.consultationRequest.findUniqueOrThrow({ where: { id: pending.id } })).status, "UNASSIGNED", "Expired requests are never silently moved.");
  await teamWrite(owner, tx => syncConsultationTask(tx, original.id, owner.id));
  const scoped = await teamRead(viewer, "team-queue", new URLSearchParams()) as { tasks: unknown[]; waiting: unknown[] };
  assert.equal(scoped.tasks.length, 0); assert.equal(scoped.waiting.length, 0);
  await prisma.teamClient.update({ where: { id: original.clientId }, data: { status: "DO_NOT_CONTACT" } });
  await syncGoogleCalendar(workspace.id, event.id, transport);
  assert.equal((await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: event.id } })).googleSyncStatus, "CANCELLED"); assert.equal(deletes, 1);
  console.log("PASS unified CRM: migration parity, shared customer identity, atomic consultation booking, concurrent capacity, idempotency, private calendar scope, rescheduling without invented calls, stale edits, accepted handoffs, shared workload, first-call attempts, waiting allocation, Google event identity/title/description/Meet, concurrent sync, retry/reconnect, URL validation and opt-out cancellation. All Google requests were simulated; no invitations were sent.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
