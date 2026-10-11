import { Prisma } from "@prisma/client";
import { reverseReferralForTransactionInTransaction } from "@/lib/referrals";

// Called only for persisted, signature-verified provider events, in the event transaction.
export async function reviewSubscriptionReferralPayment(tx: Prisma.TransactionClient, event: { id: number; paymentId: string | null; eventType: string; amountMinor: number | null }) {
  if (!event.paymentId || !["refund.created", "refund.processed", "payment.dispute.created", "payment.dispute.lost"].includes(event.eventType)) return;
  const payment = await tx.subscriptionPayment.findUnique({ where: { razorpayPaymentId: event.paymentId } });
  if (!payment) return;
  await tx.$queryRaw`SELECT id FROM referrals WHERE qualifying_transaction_type = 'subscription_payment' AND qualifying_transaction_id = ${String(payment.id)} FOR UPDATE`;
  const referral = await tx.referral.findFirst({ where: { qualifyingTransactionType: "subscription_payment", qualifyingTransactionId: String(payment.id) } });
  if (!referral || ["REVERSED", "REJECTED"].includes(referral.status)) return;
  const final = ["refund.processed", "payment.dispute.lost"].includes(event.eventType);
  const full = final && event.amountMinor === payment.amount;
  if (full) {
    await tx.subscriptionPayment.update({ where: { id: payment.id }, data: { status: event.eventType === "refund.processed" ? "refunded" : "charged_back" } });
    if (referral.status === "REWARDED") {
      await reverseReferralForTransactionInTransaction(tx, { transactionType: "subscription_payment", transactionId: payment.id, reason: event.eventType === "refund.processed" ? "refunded" : "charged_back" });
    } else await tx.referral.update({ where: { id: referral.id }, data: { status: "REJECTED", rejectionReason: "Qualifying payment was reversed.", riskStatus: "reviewed" } });
  } else {
    await tx.referral.update({ where: { id: referral.id }, data: { riskStatus: "review_required" } });
  }
  await tx.notification.upsert({ where: { eventKey: `referral:${referral.id}:payment-review:${event.id}` }, update: {}, create: { userId: referral.userId, type: "account", title: "Referral payment update", body: full ? "The qualifying payment was reversed. Your referral reward has been updated or held for review." : "The qualifying payment needs review. Referral credit is not available for approval until the review is resolved.", href: "/dashboard?tab=referral", eventKey: `referral:${referral.id}:payment-review:${event.id}` } });
  await tx.auditLog.create({ data: { actorType: "system", action: "REFERRAL_PAYMENT_REVIEW", entity: "referral", entityId: String(referral.id), metadata: { eventId: event.id, fullReversal: full } } });
}
