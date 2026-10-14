import "server-only";
import { prisma } from "@/lib/prisma";
import { confirmReviewPayment, playlistGatewayCall } from "@/lib/playlist-reviews";
import { razorpay } from "@/lib/razorpay";

// Called only after the raw webhook signature has been verified by the route.
export async function processPlaylistReviewWebhook(payload: unknown): Promise<boolean> {
  const body = payload as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } }; refund?: { entity?: { payment_id?: string; id?: string } }; dispute?: { entity?: { payment_id?: string } } } };
  const payment = body?.payload?.payment?.entity;
  const refund = body?.payload?.refund?.entity;
  const dispute = body?.payload?.dispute?.entity;
  const orderId = payment?.order_id;
  const paymentId = payment?.id || refund?.payment_id || dispute?.payment_id;
  if (!orderId && !paymentId) return false;
  const row = await prisma.playlistReviewRequest.findFirst({ where: { OR: [...(orderId ? [{ razorpayOrderId: orderId }] : []), ...(paymentId ? [{ razorpayPaymentId: paymentId }] : [])] } }).catch((error: { code?: string }) => {
    // A rolling deployment must not interrupt unrelated existing checkout products.
    if (error.code === "P2021") return null;
    throw error;
  });
  if (!row) return false;
  if (["payment.captured", "order.paid"].includes(body.event || "") && orderId && paymentId) await confirmReviewPayment(orderId, paymentId);
  else if (body.event?.startsWith("refund.") && row.razorpayPaymentId && razorpay) {
    const refunds = await playlistGatewayCall(razorpay.payments.fetchMultipleRefund(row.razorpayPaymentId));
    const total = refunds.items.filter(item => item.status === "processed").reduce((sum, item) => sum + Number(item.amount), 0);
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422061, ${row.id}::integer)`;
      await tx.playlistReviewRequest.update({ where: { id: row.id }, data: { status: total >= row.amountMinor ? "REFUNDED" : row.status === "REFUND_PENDING" ? "REFUND_PENDING" : "DISPUTED", refundId: total >= row.amountMinor ? refund?.id : undefined, payoutStatus: total >= row.amountMinor ? "NOT_EARNED" : "FROZEN", refundReason: "Payment provider reported a refund; partial or pending external refunds require investigation." } });
      if (total >= row.amountMinor) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: row.customerId } });
        await tx.playlistReviewMail.upsert({ where: { eventKey: `review:${row.id}:refund` }, create: { eventKey: `review:${row.id}:refund`, userId: user.id, toEmail: user.email, subject: "Your review fee has been refunded", body: `The payment provider confirmed a full refund of ₹${row.amountMinor / 100} for ${row.trackTitle}. Bank processing times may vary. Your music’s potential is not defined by this outcome.` }, update: {} });
      }
      await tx.auditLog.create({ data: { actorType: "system", action: "PLAYLIST_REVIEW_PROVIDER_REFUND", entity: "playlist_review", entityId: String(row.id), metadata: { processedAmountMinor: total, previouslySettled: row.payoutStatus === "PAID" } } });
    });
  } else if (body.event?.startsWith("payment.dispute.")) {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422061, ${row.id}::integer)`;
      await tx.playlistReviewRequest.update({ where: { id: row.id }, data: { status: "DISPUTED", payoutStatus: "FROZEN", refundReason: "A payment-provider dispute requires HYMN investigation." } });
      await tx.playlistReviewMail.upsert({ where: { eventKey: `review:${row.id}:provider-dispute` }, create: { eventKey: `review:${row.id}:provider-dispute`, toEmail: "hymnmusicindia@gmail.com", subject: "Payment dispute: playlist review needs attention", body: `Review ${row.id} has a provider dispute. Investigate before making any curator settlement. Previously settled: ${row.payoutStatus === "PAID"}.` }, update: {} });
      await tx.auditLog.create({ data: { actorType: "system", action: "PLAYLIST_REVIEW_PROVIDER_DISPUTE", entity: "playlist_review", entityId: String(row.id), metadata: { previouslySettled: row.payoutStatus === "PAID" } } });
    });
  }
  return true;
}
