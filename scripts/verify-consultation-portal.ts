import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { submitConsultation } from "../lib/consultation-portal";
import { TeamError } from "../lib/team/policy";
import { teamMutation, teamRead } from "../lib/team/service";
import { roleTemplates } from "../lib/team/policy";

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55461/team_fixture")) throw new Error("This test requires the isolated Team OS fixture database.");
  const workspace = await prisma.teamWorkspace.create({ data: { name: "Isolated HYMN Consultation" } });
  const createMember = async (name: string, roleName: keyof typeof roleTemplates, preferences: object = {}) => {
    const role = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: roleName, owner: roleName === "Owner", permissions: roleTemplates[roleName] } });
    const user = await prisma.user.create({ data: { name, email: `${name}@example.test`, googleId: `consultation-${name}` } });
    return prisma.teamMember.create({ data: { userId: user.id, workspaceId: workspace.id, roleId: role.id, preferences }, include: { role: true } });
  };
  const owner = await createMember("consultation-owner", "Owner");
  const openHours = { consultationServices: ["DISTRIBUTION"], workAvailability: { weeklyMinutes: 60, leave: {}, plans: {}, recurring: { enabled: true, assignOnlyWhileActive: false, restrictOverrides: false, slots: Array.from({ length: 7 }, (_, day) => ({ day, start: 0, end: 1440 })) } } };
  const caller = await createMember("consultation-caller", "Call Representative", openHours);
  const researcher = await createMember("consultation-researcher", "Researcher", openHours);
  const createCustomer = (name: string) => prisma.user.create({ data: { name, email: `${name}@example.test`, googleId: `consultation-customer-${name}` } });
  const customer = await createCustomer("lead-one");
  const makeInput = (idempotencyKey: string, callbackAt: Date | null) => ({
    idempotencyKey,
    fullName: "Lead One",
    dialCode: "91",
    phone: "+91 98765 43210",
    interests: ["DISTRIBUTION"],
    otherRequirement: "",
    callbackAt: callbackAt?.toISOString() ?? null,
    source: "instagram",
    campaign: "fixture campaign",
    referralUrl: "https://example.test/reel",
    landingPageUrl: "/consultation?utm_source=instagram",
    referrer: "https://instagram.com/",
    firstTouchSource: "instagram",
    latestTouchSource: "instagram",
    utm: { source: "instagram", medium: "reel", campaign: "fixture", content: "test", term: "" },
    funnelEvents: ["CONSULTATION_PAGE_VIEWED", "AUTHENTICATION_COMPLETED"],
    consent: true,
    marketingConsent: false
  });
  const slot = new Date(Math.ceil((Date.now() + 90 * 60_000) / (30 * 60_000)) * (30 * 60_000));
  const idempotencyKey = "e5e1025a-1faf-4d6c-86a2-b2e03e11bbd3";
  const created = await submitConsultation(customer.id, makeInput(idempotencyKey, slot));
  assert.equal(created.status, "ASSIGNED", "A preferred callback time is not a booked calendar appointment.");
  assert.equal(created.assigned, true);
  const saved = await prisma.consultationRequest.findUniqueOrThrow({ where: { id: created.id }, include: { user: true, client: true } });
  assert.equal(saved.assignedMemberId, caller.id);
  assert.equal(saved.phoneE164, "+919876543210");
  assert.equal(saved.user.mobile, "+919876543210");
  assert.equal(saved.client.phone, "+919876543210");
  assert.equal(saved.consentVersion, "consultation-privacy-v2");
  assert.equal(saved.marketingConsent, false);
  assert.equal(saved.firstTouchSource, "instagram");
  assert.equal(saved.preferredCallback?.toISOString(), slot.toISOString());
  assert.equal(saved.calendarEventId, null, "The preference is stored without reserving a team calendar slot.");
  assert.equal((await submitConsultation(customer.id, makeInput(idempotencyKey, slot))).duplicate, true, "Retrying the same request must not create a second consultation.");
  assert.equal(await prisma.consultationRequest.count({ where: { userId: customer.id } }), 1);

  const callbackOnlyCustomer = await createCustomer("lead-callback-only");
  const callbackOnly = await submitConsultation(callbackOnlyCustomer.id, makeInput("7930a8a6-aac8-4b99-891a-94ae201fab2c", null));
  assert.equal(callbackOnly.status, "ASSIGNED", "A callback request without a chosen slot is assigned internally immediately.");
  assert.equal(callbackOnly.assigned, true);
  const callbackOnlySaved = await prisma.consultationRequest.findUniqueOrThrow({ where: { id: callbackOnly.id } });
  assert.equal(callbackOnlySaved.assignedMemberId, caller.id);
  assert.equal(callbackOnlySaved.calendarEventId, null, "No calendar slot is reserved before HYMN contacts the customer.");

  const concurrentUsers = await Promise.all([createCustomer("lead-two"), createCustomer("lead-three")]);
  const concurrent = await Promise.all(concurrentUsers.map((user, index) => submitConsultation(user.id, makeInput(`44b393e${index}-9a6d-4fbe-912d-726a20a3d22${index}`, slot))));
  assert.equal(concurrent.length, 2, "Simultaneous callback preferences are both accepted without competing calendar reservations.");
  assert.ok(concurrent.every(result => result.status === "ASSIGNED" && result.assigned));
  const concurrentRequests = await prisma.consultationRequest.findMany({ where: { id: { in: concurrent.map(result => result.id) } } });
  assert.ok(concurrentRequests.every(request => request.preferredCallback?.toISOString() === slot.toISOString() && request.calendarEventId === null), "Callback preferences are stored without creating calendar holds.");

  await prisma.consultationRequest.update({ where: { id: created.id }, data: { assignedMemberId: researcher.id } });
  const scoped = await teamRead(researcher, "consultations", new URLSearchParams());
  assert.ok("items" in scoped && (scoped.items as Array<{ id: string }>).some(item => item.id === created.id));
  await assert.rejects(() => teamMutation(researcher, "consultations", { action: "status", id: created.id, status: "CONTACTED" }), error => error instanceof TeamError && error.status === 403, "Read-only researchers cannot modify lead status.");
  const otherMembersLeads = await teamRead(caller, "consultations", new URLSearchParams({ q: customer.email }));
  assert.ok("items" in otherMembersLeads && (otherMembersLeads.items as unknown[]).length === 0, "Members see only leads assigned to them.");

  await prisma.consultationRequest.update({ where: { id: created.id }, data: { assignedMemberId: caller.id } });
  await teamMutation(caller, "consultations", { action: "request_reassignment", id: created.id, message: "I need help covering this callback." });
  await teamMutation(caller, "consultations", { action: "request_reassignment", id: created.id, message: "Duplicate reassignment request." });
  assert.equal(await prisma.consultationActivity.count({ where: { consultationId: created.id, kind: "REASSIGNMENT_REQUESTED" } }), 1, "Repeated reassignment requests are deduplicated until assignment changes.");
  assert.ok(await prisma.teamNotification.count({ where: { memberId: owner.id, title: { contains: "Reassignment requested" } } }) > 0);

  console.log("Consultation database checks passed: contact card and E.164 phone, callback assignment and reminders, submission idempotency, booking concurrency, member data scope, read-only authorization and reassignment notifications.");
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
