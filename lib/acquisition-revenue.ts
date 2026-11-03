import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import { getUserSessionSecret } from "@/lib/env";
import { paymentRefundState, paymentDisputeState } from "@/lib/payment-refund-state";

export type RevenueSource = "distribution_order" | "checkout_order" | "subscription_payment" | "studio_payment";
export const ACQUISITION_ATTRIBUTION_COOKIE = "hymn_acquisition_attribution";

export async function recordVerifiedAcquisitionRevenue(input: { sourceType: RevenueSource; sourceId: string; customerId: number; paymentId: string; currency: string; recognisedRevenueMinor: number }) {
  if (!input.paymentId || !Number.isSafeInteger(input.recognisedRevenueMinor) || input.recognisedRevenueMinor < 0) throw new Error("Verified revenue evidence is invalid.");
  const attribution = await prisma.acquisitionLead.findFirst({ where: { customerId: input.customerId, attributionLockedAt: { not: null }, acquisitionEmployeeId: { not: null } }, select: { workspaceId: true } });
  const referral = !attribution ? await prisma.referral.findFirst({ where: { endedAt:null, referredUserId: input.customerId }, select: { id: true } }) : null;
  if (!attribution && !referral) return null;
  const evidence = await prisma.acquisitionRevenueEvidence.upsert({
    where: { sourceType_sourceId: { sourceType: input.sourceType, sourceId: input.sourceId } },
    create: { ...input, workspaceId: attribution?.workspaceId, status: "RECONCILIATION_REQUIRED" },
    update: {},
  });
  if (attribution && evidence.workspaceId === null && !evidence.reviewedAt) {
    await prisma.acquisitionRevenueEvidence.updateMany({ where: { id: evidence.id, workspaceId: null, reviewedAt: null, eligibleNetRevenueMinor: null }, data: { workspaceId: attribution.workspaceId } });
    return prisma.acquisitionRevenueEvidence.findUniqueOrThrow({ where: { id: evidence.id } });
  }
  return evidence;
}

export async function flagAcquisitionRevenueAdjustment(paymentId: string, providerEventId: string) {
  const evidence = await prisma.acquisitionRevenueEvidence.findUnique({ where: { paymentId } });
  if (!evidence || evidence.status !== "RECONCILED") return;
  const events = await prisma.paymentWebhookEvent.findMany({ where: { paymentId, signatureValid: true, eventType: { in: ['refund.created', 'refund.processed', 'refund.failed', 'payment.dispute.created', 'payment.dispute.won', 'payment.dispute.lost'] } } });
  const refunds = paymentRefundState(events), dispute = paymentDisputeState(events);
  const sourceId = Number(evidence.sourceId);
  const source = !Number.isSafeInteger(sourceId) || sourceId <= 0 ? null : evidence.sourceType === 'distribution_order' ? await prisma.distributionOrder.findUnique({ where: { id: sourceId }, select: { amount: true } }) : evidence.sourceType === 'checkout_order' ? await prisma.checkoutOrder.findUnique({ where: { id: sourceId }, select: { finalAmount: true } }) : evidence.sourceType === 'subscription_payment' ? await prisma.subscriptionPayment.findUnique({ where: { id: sourceId }, select: { amount: true } }) : evidence.sourceType === 'studio_payment' ? await prisma.studioPayment.findUnique({ where: { id: sourceId }, select: { amount: true } }) : null;
  const gross = source && 'finalAmount' in source ? Math.round(Number(source.finalAmount) * 100) : source && 'amount' in source ? Math.round(Number(source.amount) * (evidence.sourceType === 'subscription_payment' ? 1 : 100)) : 0;
  const refunded = dispute === 'payment.dispute.lost' ? gross : Math.min(gross, refunds.totalMinor);
  const required = gross > 0 ? proportionalRefundMinor(evidence.recognisedRevenueMinor, gross, refunded) : 0;
  // A new delivery ID is not a new financial adjustment. Already-accounted
  // refunds and delayed opening events must not reopen a settled review.
  if (source && gross > 0 && !refunds.unknown && !refunds.pending.size && dispute !== 'payment.dispute.created' && (evidence.refundsChargebacksMinor ?? 0) >= required) return;
  const changed = await prisma.acquisitionRevenueEvidence.updateMany({ where: { id: evidence.id, status: 'RECONCILED', updatedAt: evidence.updatedAt }, data: { status: "ADJUSTMENT_REQUIRED" } });
  if (!changed.count) return;
  if (evidence.reviewedByEmployeeId && evidence.workspaceId) await prisma.acquisitionProgramAudit.create({ data: { workspaceId: evidence.workspaceId, actorEmployeeId: evidence.reviewedByEmployeeId, action: "revenue.provider_adjustment_received", entityId: evidence.id, metadata: { providerEventId, paymentId, previousStatus: evidence.status } } });
}

export function eligibleNetRevenue(input: { recognisedRevenueMinor: number; applicableTaxesMinor: number; refundsChargebacksMinor: number; directPassThroughCostsMinor: number; providerFeeMinor: number }) {
  const values = Object.values(input);
  if (values.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error("Revenue amounts must be nonnegative integer minor units.");
  const net = input.recognisedRevenueMinor - input.applicableTaxesMinor - input.refundsChargebacksMinor - input.directPassThroughCostsMinor - input.providerFeeMinor;
  if (net < 0) throw new Error("Deductions exceed recognised HYMN revenue; reconcile the source records.");
  return net;
}

export function checkoutRetainedRevenueMinor(hymnCommissionMajor: number) {
  if (!Number.isFinite(hymnCommissionMajor) || hymnCommissionMajor < 0) throw new Error("Recorded HYMN marketplace share must be nonnegative.");
  return Math.round(hymnCommissionMajor * 100);
}

export function studioRetainedRevenueMinor(paymentAmountMinor: number, commissionRate: number) {
  if (!Number.isSafeInteger(paymentAmountMinor) || paymentAmountMinor < 0 || !Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 1) throw new Error("Studio payment share inputs are invalid.");
  const rateBps = Math.round(commissionRate * 10000);
  if (Math.abs(rateBps / 10000 - commissionRate) > 0.000001) throw new Error("Studio commission rate must be a recorded precision rate.");
  return Math.floor(paymentAmountMinor * rateBps / 10000);
}

export function proportionalRefundMinor(recognisedRevenueMinor: number, grossPaymentMinor: number, refundAmountMinor: number) {
  if (![recognisedRevenueMinor, grossPaymentMinor, refundAmountMinor].every(Number.isSafeInteger) || recognisedRevenueMinor < 0 || grossPaymentMinor <= 0 || refundAmountMinor < 0) throw new Error("Refund allocation inputs are invalid.");
  const gross = BigInt(grossPaymentMinor);
  return Number((BigInt(recognisedRevenueMinor) * BigInt(Math.min(grossPaymentMinor, refundAmountMinor)) + gross / 2n) / gross);
}

export async function attachNewCustomerToAcquisitionLead(tx: Prisma.TransactionClient, input: { token?: string | null; customerId: number; email: string }) {
  if (!input.token) return false;
  let claims: { purpose?: string; leadId?: string; employeeId?: string };
  try {
    const decoded = jwt.verify(input.token, getUserSessionSecret());
    if (typeof decoded === "string") return false;
    claims = decoded as typeof claims;
  } catch { return false; }
  if (claims.purpose !== "acquisition_lead" || !claims.leadId || !claims.employeeId) return false;
  const lead = await tx.acquisitionLead.findFirst({ where: { id: claims.leadId, acquisitionEmployeeId: claims.employeeId, customerId: null, prospect: { stage: { in: ["QUALIFIED", "READY_TO_CONTACT", "INTERESTED"] }, suppressed: false } }, include: { prospect: true } });
    if (!lead || (lead.prospect.email && lead.prospect.email.trim().toLowerCase() !== input.email.trim().toLowerCase())) return false;
    const claimed = await tx.acquisitionLead.updateMany({ where: { id: lead.id, customerId: null }, data: { customerId: input.customerId, convertedAt: new Date() } });
    if (claimed.count !== 1) return false;
    await tx.teamProspect.update({ where: { id: lead.prospectId }, data: { stage: "CONVERTED", version: { increment: 1 } } });
    if (lead.prospect.leadId) await tx.growthLead.update({ where: { id: lead.prospect.leadId }, data: { userId: input.customerId, status: "converted" } });
    await tx.acquisitionProgramAudit.create({ data: { workspaceId: lead.workspaceId, actorEmployeeId: lead.acquisitionEmployeeId!, action: "lead.customer_matched_from_signed_link", entityId: lead.id, metadata: { customerId: input.customerId, researcherEmployeeId: lead.researcherEmployeeId, acquisitionEmployeeId: lead.acquisitionEmployeeId } } });
    return true;
}
