import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { recordVerifiedAcquisitionRevenue } from "../lib/acquisition-revenue";
import { acquisitionMutation, acquisitionRead } from "../lib/team/acquisition";
import { processAcquisitionEmailEvent } from "../lib/team/acquisition-email";

async function main() {
  const suffix = Date.now().toString(36);
  const researcherUser = await prisma.user.create({ data: { googleId: `acq-r-${suffix}`, name: "Researcher", email: `r-${suffix}@fixture.invalid` } });
  const converterUser = await prisma.user.create({ data: { googleId: `acq-c-${suffix}`, name: "Converter", email: `c-${suffix}@fixture.invalid` } });
  const customer = await prisma.user.create({ data: { googleId: `acq-u-${suffix}`, name: "Customer", email: `u-${suffix}@fixture.invalid` } });
  const workspace = await prisma.teamWorkspace.create({ data: { name: `Acquisition ${suffix}` } });
  const role = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: "Acquisition Admin", owner: true, permissions: ["crm.prospects.view", "crm.prospects.create", "crm.prospects.assign", "crm.outreach.manage", "crm.all", "acquisition.admin"] } });
  const researcher = await prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: researcherUser.id, roleId: role.id } });
  const converter = await prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: converterUser.id, roleId: role.id } });
  const actor = await prisma.teamMember.findUniqueOrThrow({ where: { id: researcher.id }, include: { role: true } });
  const prospectContact = `artist-${suffix}@fixture.invalid`;
  const growth = await prisma.growthLead.create({ data: { kind: "acquisition", name: "Fixture Artist", email: prospectContact, interest: "Distribution", message: "Fixture source-backed lead" } });
  const prospect = await prisma.teamProspect.create({ data: { workspaceId: workspace.id, ownerId: researcher.id, name: "Fixture Artist", contactName: "Fixture Artist", email: prospectContact, sourceUrl: "https://example.org/artist", evidence: "Public professional contact source", categories: ["Distribution"], score: { intent: 10 }, stage: "INTERESTED", contactEligibility: "LEGITIMATE_INTEREST", verified: true, identityKey: `fixture-${suffix}`, leadId: growth.id } });
  const lead = await prisma.acquisitionLead.create({ data: { workspaceId: workspace.id, prospectId: prospect.id, researcherEmployeeId: researcher.id, acquisitionEmployeeId: converter.id, customerId: customer.id, convertedAt: new Date(), attributionLockedAt: new Date() } });

  const order = await prisma.checkoutOrder.create({ data: { userId: customer.id, originalPrice: 100, finalAmount: 100, razorpayOrderId: `order-${suffix}`, razorpayPaymentId: `pay-${suffix}`, paymentStatus: "paid" } });
  const evidence = await recordVerifiedAcquisitionRevenue({ sourceType: "checkout_order", sourceId: String(order.id), customerId: customer.id, paymentId: `pay-${suffix}`, currency: "INR", recognisedRevenueMinor: 10000 });
  assert.equal(evidence?.status, "RECONCILIATION_REQUIRED");
  await prisma.acquisitionProgramSettings.create({ data: { workspaceId: workspace.id, enabled: true, holdPeriodDays: 0, payoutMinimumMinor: 0, revenuePolicy: "Recognised retained revenue less verified taxes, refunds and direct pass-through costs." } });
  const review = (refunds: number, adjustmentReference?: string) => prisma.$transaction(tx => acquisitionMutation(tx, actor, "acquisition-evidence-review", { id: evidence!.id, applicableTaxesMinor: 1000, refundsChargebacksMinor: refunds, directPassThroughCostsMinor: 1000, providerFeeMinor: 0, taxEvidence: ["tax-invoice-fixture"], costEvidence: ["marketplace-settlement-fixture"], adjustmentReference, reason: "Reviewed fixture financial records" }));
  await review(0);
  assert.equal(await prisma.acquisitionCommission.count({ where: { leadId: lead.id, entryType: "EARNED" } }), 2);
  assert.equal(await prisma.acquisitionCommission.aggregate({ where: { leadId: lead.id, entryType: "EARNED" }, _sum: { amountMinor: true } }).then(result => result._sum.amountMinor), 400);

  await prisma.paymentWebhookEvent.create({ data: { providerEventId: `refund-event-${suffix}`, eventType: "refund.processed", payloadHash: `refund-hash-${suffix}`, signatureValid: true, paymentId: `pay-${suffix}`, amountMinor: 5000, currency: "INR", payloadRedacted: { event: "refund.processed", entity: { id: `rfnd-${suffix}`, amount: 5000 } }, processingState: "processed" } });
  await prisma.acquisitionRevenueEvidence.update({ where: { id: evidence!.id }, data: { status: "ADJUSTMENT_REQUIRED" } });
  await review(5000, `rfnd-${suffix}`);
  assert.equal(await prisma.acquisitionCommission.count({ where: { leadId: lead.id, entryType: "ADJUSTMENT" } }), 2);
  const netCommission = await prisma.acquisitionCommission.aggregate({ where: { leadId: lead.id }, _sum: { amountMinor: true } });
  assert.equal(netCommission._sum.amountMinor, 150, "Partial refunds create negative adjustments while preserving original ledger rows.");

  const commissions = await prisma.acquisitionCommission.findMany({ where: { leadId: lead.id }, orderBy: { attributionRole: "asc" } });
  const approved = await prisma.$transaction(tx => acquisitionMutation(tx, actor, "acquisition-payout-approve", { employeeId: researcher.id, commissionIds: commissions.filter(row => row.employeeId === researcher.id).map(row => row.id), reason: "Fixture payout batch approval" }));
  assert.equal((await acquisitionRead(actor, "acquisition-ledger", new URLSearchParams()) as { items: { status: string }[] }).items.some(row => row.status === "APPROVED"), true);
  await prisma.$transaction(tx => acquisitionMutation(tx, actor, "acquisition-payout-record", { payoutId: (approved as { id: string }).id, paymentReference: `utr-${suffix}`, reason: "Fixture transfer confirmation evidence" }));
  const ledgerAfterPay = await acquisitionRead(actor, "acquisition-ledger", new URLSearchParams()) as { items: { status: string; payoutReference?: string | null }[] };
  assert.equal(ledgerAfterPay.items.some(row => row.status === "PAID" && row.payoutReference === `utr-${suffix}`), true);

  const templates = await acquisitionRead(actor, "acquisition-email-templates", new URLSearchParams()) as { items: { id: string; slug: string }[] };
  assert.equal(templates.items.length >= 3, true);
  const template = templates.items.find(row => row.slug === "music-distribution")!;
  const draft = await prisma.$transaction(tx => acquisitionMutation(tx, actor, "acquisition-email-draft", { prospectId: prospect.id, templateId: template.id, subject: "Fixture outreach", body: "Hello Fixture Artist" })) as { id: string; status: string };
  assert.equal(draft.status, "DRAFT");
  const queued = await prisma.$transaction(tx => acquisitionMutation(tx, actor, "acquisition-email-queue", { prospectId: prospect.id, templateId: template.id, subject: "Fixture outreach", body: "Hello Fixture Artist" })) as { id: string; status: string };
  assert.equal(queued.status, "QUEUED");
  const sendResult = await processAcquisitionEmailEvent(queued.id);
  assert.equal(sendResult?.status, "skipped", "Disabled fixture email configuration must never simulate a send.");
  assert.equal((await prisma.acquisitionEmailEvent.findUniqueOrThrow({ where: { id: queued.id } })).status, "FAILED");
  console.log("Acquisition attribution, revenue reconciliation, partial refund, payout and email persistence checks passed.");
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
