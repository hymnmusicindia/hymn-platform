import { prisma } from "@/lib/prisma";
import { razorpay } from "@/lib/razorpay";

// Only a buyer's explicitly cancelled, unpaid checkout can release its hold.
// Pending/authorized payments keep their reservation for reconciliation.
export async function releaseCheckoutReservation(userId: number, orderId: string) {
  const order = await prisma.checkoutOrder.findUnique({ where: { razorpayOrderId: orderId }, select: { id: true, userId: true, paymentStatus: true } });
  if (!order || order.userId !== userId) throw new Error("Checkout not found.");
  if (order.paymentStatus !== "created") return { released: false };
  const held = await prisma.beat.count({ where: { exclusiveReservationOrderId: orderId, exclusiveReservedByUserId: userId, status: "EXCLUSIVE_RESERVED" } });
  if (!held) return { released: false };
  if (!razorpay) throw new Error("Could not check payment status. Your reservation remains protected.");
  const [providerOrder, payments] = await Promise.all([razorpay.orders.fetch(orderId), razorpay.orders.fetchPayments(orderId)]);
  if (providerOrder.status === "paid" || Number(providerOrder.amount_paid) > 0 || payments.items.some(payment => payment.status !== "failed")) {
    return { released: false };
  }
  return prisma.$transaction(async tx => {
    // This update also locks the order against concurrent webhook fulfilment.
    const cancelled = await tx.checkoutOrder.updateMany({ where: { id: order.id, userId, paymentStatus: "created" }, data: { paymentStatus: "cancelled" } });
    if (!cancelled.count) return { released: false };
    const released = await tx.beat.updateMany({ where: { exclusiveReservationOrderId: orderId, exclusiveReservedByUserId: userId, status: "EXCLUSIVE_RESERVED" }, data: { status: "PUBLISHED", exclusiveReservedByUserId: null, exclusiveReservationOrderId: null, exclusiveReservationExpiresAt: null } });
    await tx.auditLog.create({ data: { actorId: userId, actorRole: "customer", action: "BEAT_EXCLUSIVE_RESERVATION_CANCELLED", entity: "checkout_order", entityId: String(order.id), metadata: { razorpayOrderId: orderId, releasedBeats: released.count } } });
    return { released: released.count > 0 };
  }, { maxWait: 5000, timeout: 20000 });
}
