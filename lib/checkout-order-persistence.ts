import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeBeatLicenseType } from "@/lib/beat-store";
import type { Order } from "@/lib/types";

// Only inventory checks/reservations and the atomic order write belong inside
// this transaction. Hydrate buyer, producer and file details after committing.
export async function persistCheckoutOrder(input: Omit<Order, "id" | "createdAt" | "buyerName" | "buyerEmail">) {
  return prisma.$transaction(async tx => {
    const beatIds = [...new Set(input.items.map(item => item.beatId))];
    await tx.beat.updateMany({ where: { id: { in: beatIds }, status: "EXCLUSIVE_RESERVED", exclusiveReservationExpiresAt: { lt: new Date() } }, data: { status: "PUBLISHED", exclusiveReservedByUserId: null, exclusiveReservationOrderId: null, exclusiveReservationExpiresAt: null } });
    const beats = await tx.beat.findMany({ where: { id: { in: beatIds }, enabled: true }, select: { id: true, status: true, exclusiveReservationExpiresAt: true } });
    if (beats.length !== beatIds.length) throw new Error("One or more selected beats are unavailable.");
    const now = new Date();
    const reservationExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);
    for (const item of input.items) {
      const beat = beats.find((entry) => entry.id === item.beatId);
      if (!beat) throw new Error("One or more selected beats are unavailable.");
      if (normalizeBeatLicenseType(item.licenseType) === "exclusive") {
        const reserved = await tx.beat.updateMany({
          where: { id: beat.id, enabled: true, OR: [{ status: "PUBLISHED" }, { status: "EXCLUSIVE_RESERVED", exclusiveReservationExpiresAt: { lt: now } }] },
          data: { status: "EXCLUSIVE_RESERVED", exclusiveReservedByUserId: input.userId, exclusiveReservationOrderId: input.razorpayOrderId, exclusiveReservationExpiresAt: reservationExpiresAt }
        });
        if (reserved.count !== 1) throw new Error("This beat is no longer available for exclusive licensing.");
        await tx.auditLog.create({ data: { actorId: input.userId, actorRole: "customer", action: "BEAT_EXCLUSIVE_RESERVED", entity: "beat", entityId: String(beat.id), newValue: { status: "EXCLUSIVE_RESERVED", expiresAt: reservationExpiresAt }, metadata: { razorpayOrderId: input.razorpayOrderId } } });
      } else if (beat.status !== "PUBLISHED") {
        throw new Error("This beat is temporarily unavailable for licensing.");
      }
    }
    const order = await tx.checkoutOrder.create({
      data: {
        userId: input.userId,
        productId: input.productId ?? "beatstore",
        originalPrice: new Prisma.Decimal(input.originalPrice ?? input.amount),
        discountApplied: new Prisma.Decimal(input.discountApplied ?? 0),
        referralCreditsUsed: input.referralCreditsUsed ?? 0,
        finalAmount: new Prisma.Decimal(input.finalAmount ?? input.amount),
        couponCode: input.couponCode ?? null,
        razorpayOrderId: input.razorpayOrderId,
        paymentStatus: input.paymentStatus,
        currency: "INR",
        items: { create: input.items.map(item => ({ beatId: item.beatId, licenseType: item.licenseType, price: new Prisma.Decimal(item.price), licenseUrl: item.licenseUrl ?? null })) }
      },
      select: { id: true }
    });
    return order.id;
  }, { maxWait: 5000, timeout: 20000 });
}
