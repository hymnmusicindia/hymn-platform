import { Prisma, StudioOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVE_STUDIO_ORDER_STATUSES, assertStudioOrderTransition } from "@/lib/studio-services-state";
import { razorpay, verifyCapturedRazorpayPayment, verifyRazorpaySignature } from "@/lib/razorpay";
import { ensureClaimedContributorParty } from "@/lib/contributor-identity";

const COMMISSION_RATE = new Prisma.Decimal("0.20");
async function studioSerializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>, timeout = 10_000, isolationLevel: Prisma.TransactionIsolationLevel = Prisma.TransactionIsolationLevel.Serializable): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel, timeout });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
  throw new Error("Studio transaction retry limit reached.");
}
async function studioEvent(tx: Prisma.TransactionClient, input: { event: string; key: string; userId?: number; orderId?: number; properties?: Prisma.InputJsonObject }) { await tx.growthEvent.createMany({ data: [{ event: input.event, key: input.key, source: "server", userId: input.userId, properties: { studio_order_id: input.orderId ?? null, ...(input.properties ?? {}) } }], skipDuplicates: true }); }

export async function listStudioEngineers(filters: { genre?: string; maxPrice?: number; maxTurnaround?: number } = {}) {
  return prisma.engineerProfile.findMany({
    where: {
      sellerState: "ACTIVE", availability: "AVAILABLE",
      listings: { some: { active: true, paused: false, serviceType: "MIXING_MASTERING",
        ...(filters.maxPrice ? { standardPrice: { lte: filters.maxPrice } } : {}),
        ...(filters.maxTurnaround ? { turnaroundDays: { lte: filters.maxTurnaround } } : {}),
        ...(filters.genre ? { acceptedGenres: { has: filters.genre } } : {}) } },
    },
    include: { listings: { where: { active: true, paused: false, serviceType: "MIXING_MASTERING" }, orderBy: { sortOrder: "asc" } } },
    orderBy: [{ verificationState: "desc" }, { ratingAverage: "desc" }, { completedOrderCount: "desc" }],
  });
}

export async function createStudioOrder(input: { customerId: number; listingPublicId: string; projectTitle: string; beatPurchaseId?: number; idempotencyKey: string; termsAccepted: boolean }) {
  if (!input.termsAccepted) throw new Error("You must accept the Studio Services Terms.");
  return studioSerializable(async (tx) => {
    const prior = await tx.studioOrderStatusEvent.findFirst({ where: { correlationId: input.idempotencyKey }, include: { order: true } });
    if (prior) return prior.order;
    const listing = await tx.studioServiceListing.findUnique({ where: { publicId: input.listingPublicId }, include: { engineerProfile: { include: { contributorParty: true } } } });
    if (!listing || !listing.active || listing.paused || listing.engineerProfile.sellerState !== "ACTIVE" || listing.engineerProfile.availability !== "AVAILABLE") throw new Error("This Studio service is not currently available.");
    const active = await tx.studioServiceOrder.count({ where: { engineerProfileId: listing.engineerProfileId, status: { in: ACTIVE_STUDIO_ORDER_STATUSES } } });
    if (active >= listing.engineerProfile.maxActiveOrders) throw new Error("This engineer is currently at capacity.");
    const beatPurchase = input.beatPurchaseId ? await tx.beatPurchase.findFirst({ where: { id: input.beatPurchaseId, userId: input.customerId, hasAccess: true }, include: { beat: true, checkoutOrderItem: { select: { orderId: true } } } }) : null;
    if (input.beatPurchaseId && !beatPurchase) throw new Error("The selected beat purchase is unavailable.");
    const basePrice = listing.standardPrice;
    const finalPrice = beatPurchase && listing.beatCustomerPrice ? listing.beatCustomerPrice : basePrice;
    const discountAmount = basePrice.sub(finalPrice);
    const order = await tx.studioServiceOrder.create({ data: {
      customerId: input.customerId, engineerPartyId: listing.engineerProfile.contributorPartyId,
      engineerProfileId: listing.engineerProfileId, serviceListingId: listing.id,
      sourceBeatId: beatPurchase?.beatId, sourceBeatOrderId: beatPurchase?.checkoutOrderItem?.orderId, sourceBeatPurchaseId: beatPurchase?.id,
      serviceType: listing.serviceType, projectTitle: input.projectTitle.trim(), basePrice,
      discountAmount, discountReason: discountAmount.gt(0) ? "HYMN_BEAT_CUSTOMER" : null,
      finalPrice, includedRevisions: listing.includedRevisions,
      additionalRevisionPrice: listing.additionalRevisionPrice, turnaroundDays: listing.turnaroundDays,
      commissionRate: COMMISSION_RATE, engineerShareRate: new Prisma.Decimal(1).sub(COMMISSION_RATE),
      termsVersion: "2026-09-24", termsAcceptedAt: new Date(),
      status: "AWAITING_PAYMENT",
    } });
    await tx.studioOrderStatusEvent.create({ data: { orderId: order.id, previousStatus: "DRAFT", newStatus: "AWAITING_PAYMENT", actorUserId: input.customerId, actorType: "CUSTOMER", correlationId: input.idempotencyKey, reason: "Studio order quote created" } });
    await studioEvent(tx, { event: "engineer_selected", key: `studio:${order.id}:engineer-selected`, userId: input.customerId, orderId: order.id, properties: { engineer_profile_id: listing.engineerProfileId, beat_purchase: Boolean(beatPurchase) } });
    await studioEvent(tx, { event: "studio_checkout_started", key: `studio:${order.id}:checkout-started`, userId: input.customerId, orderId: order.id, properties: { amount: finalPrice.toString(), currency: "INR" } });
    return order;
  });
}

export async function transitionStudioOrder(input: { orderId: number; to: StudioOrderStatus; actorUserId?: number; actorType: string; reason: string; correlationId?: string }) {
  return studioSerializable(async (tx) => {
    if (input.correlationId) {
      const prior = await tx.studioOrderStatusEvent.findFirst({ where: { orderId: input.orderId, correlationId: input.correlationId } });
      if (prior) return tx.studioServiceOrder.findUniqueOrThrow({ where: { id: input.orderId } });
    }
    const order = await tx.studioServiceOrder.findUniqueOrThrow({ where: { id: input.orderId } });
    assertStudioOrderTransition(order.status, input.to);
    const updated = await tx.studioServiceOrder.update({ where: { id: order.id, status: order.status }, data: { status: input.to } });
    await tx.studioOrderStatusEvent.create({ data: { orderId: order.id, previousStatus: order.status, newStatus: input.to, actorUserId: input.actorUserId, actorType: input.actorType, reason: input.reason, correlationId: input.correlationId } });
    await tx.studioMessage.create({ data: { orderId: order.id, kind: "SYSTEM", body: input.reason, idempotencyKey: input.correlationId ? `status:${input.correlationId}` : undefined } });
    if (input.to === "ACCEPTED") await studioEvent(tx, { event: "engineer_accepted", key: `studio:${order.id}:engineer-accepted`, userId: input.actorUserId, orderId: order.id });
    return updated;
  });
}

export async function assertStudioParticipant(orderPublicId: string, userId: number) {
  const order = await prisma.studioServiceOrder.findUnique({ where: { publicId: orderPublicId }, include: { engineerParty: { select: { claimedByUserId: true } } } });
  if (!order || (order.customerId !== userId && order.engineerParty.claimedByUserId !== userId)) throw new Error("Studio order not found.");
  return order;
}

export async function createStudioPayment(input: { orderPublicId: string; customerId: number; idempotencyKey: string }) {
  const order = await prisma.studioServiceOrder.findFirst({ where: { publicId: input.orderPublicId, customerId: input.customerId }, include: { payments: { where: { purpose: "INITIAL_ORDER", status: { in: ["CREATED", "CAPTURED"] } }, orderBy: { id: "desc" }, take: 1 } } });
  if (!order) throw new Error("Studio order not found.");
  if (order.status !== "AWAITING_PAYMENT") throw new Error("This Studio order is not awaiting payment.");
  if (order.payments[0]) return order.payments[0];
  const amountMinor = Number(order.finalPrice.mul(100).toFixed(0));
  if (process.env.NODE_ENV === "production" && !razorpay) throw new Error("Payment service is not configured.");
  const provider = razorpay ? await razorpay.orders.create({ amount: amountMinor, currency: "INR", receipt: `studio-${order.publicId.slice(0, 24)}`, notes: { studioOrderId: order.publicId } }) : { id: `dev_studio_${order.publicId}_${Date.now()}` };
  try {
    return await prisma.studioPayment.create({ data: { orderId: order.id, purpose: "INITIAL_ORDER", amount: order.finalPrice, razorpayOrderId: provider.id, idempotencyKey: input.idempotencyKey } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return prisma.studioPayment.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
    throw error;
  }
}

export async function createStudioRevisionPayment(input: { orderPublicId: string; customerId: number; revisionId: number; idempotencyKey: string }) {
  const order = await prisma.studioServiceOrder.findFirst({ where: { publicId: input.orderPublicId, customerId: input.customerId }, include: { revisions: { where: { id: input.revisionId }, include: { payment: true } } } });
  const revision = order?.revisions[0];
  if (!order || !revision || !revision.paymentRequired || revision.status !== "PAYMENT_REQUIRED") throw new Error("This revision does not require a new payment.");
  if (revision.payment) return revision.payment;
  const amountMinor = Number(order.additionalRevisionPrice.mul(100).toFixed(0));
  if (process.env.NODE_ENV === "production" && !razorpay) throw new Error("Payment service is not configured.");
  const provider = razorpay ? await razorpay.orders.create({ amount: amountMinor, currency: "INR", receipt: `studio-revision-${revision.id}`, notes: { studioOrderId: order.publicId, revisionId: String(revision.id) } }) : { id: `dev_studio_revision_${revision.id}_${Date.now()}` };
  try {
    return await prisma.$transaction(async tx => {
      const payment = await tx.studioPayment.create({ data: { orderId: order.id, purpose: "ADDITIONAL_REVISION", amount: order.additionalRevisionPrice, razorpayOrderId: provider.id, idempotencyKey: input.idempotencyKey } });
      await tx.studioRevision.update({ where: { id: revision.id }, data: { paymentId: payment.id } });
      return payment;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return prisma.studioPayment.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
    throw error;
  }
}

export async function proposeStudioAmendment(input: { orderPublicId: string; engineerUserId: number; description: string; amount: number }) {
  const order = await prisma.studioServiceOrder.findUnique({ where: { publicId: input.orderPublicId }, include: { engineerParty: true } });
  if (!order || order.engineerParty.claimedByUserId !== input.engineerUserId || !ACTIVE_STUDIO_ORDER_STATUSES.includes(order.status)) throw new Error("Studio order not found or closed.");
  return prisma.studioAmendment.create({ data: { orderId: order.id, proposedById: input.engineerUserId, description: input.description.trim(), amount: new Prisma.Decimal(input.amount) } });
}

export async function createStudioAmendmentPayment(input: { orderPublicId: string; customerId: number; amendmentPublicId: string; idempotencyKey: string }) {
  const amendment = await prisma.studioAmendment.findFirst({ where: { publicId: input.amendmentPublicId, order: { publicId: input.orderPublicId, customerId: input.customerId }, status: "PROPOSED" }, include: { order: true, payment: true } });
  if (!amendment) throw new Error("This scope amendment is unavailable.");
  if (amendment.payment) return amendment.payment;
  const amountMinor = Number(amendment.amount.mul(100).toFixed(0));
  if (process.env.NODE_ENV === "production" && !razorpay) throw new Error("Payment service is not configured.");
  const provider = razorpay ? await razorpay.orders.create({ amount: amountMinor, currency: "INR", receipt: `studio-amendment-${amendment.id}`, notes: { studioOrderId: amendment.order.publicId, amendmentId: amendment.publicId } }) : { id: `dev_studio_amendment_${amendment.id}_${Date.now()}` };
  return prisma.$transaction(async tx => { const payment = await tx.studioPayment.create({ data: { orderId: amendment.orderId, purpose: "AMENDMENT", amount: amendment.amount, razorpayOrderId: provider.id, idempotencyKey: input.idempotencyKey } }); await tx.studioAmendment.update({ where: { id: amendment.id }, data: { paymentId: payment.id, status: "AWAITING_PAYMENT" } }); return payment; });
}

export async function confirmStudioPayment(input: { razorpayOrderId: string; paymentId: string; signature?: string; customerId?: number; amountMinor?: number; currency?: string; source: "browser" | "webhook" }) {
  if (input.source === "browser" && (!input.signature || !verifyRazorpaySignature(input.razorpayOrderId, input.paymentId, input.signature))) throw new Error("Invalid Razorpay signature.");
  const payment = await prisma.studioPayment.findUnique({ where: { razorpayOrderId: input.razorpayOrderId }, include: { order: { include: { serviceListing: true, engineerParty: true } } } });
  if (!payment) throw new Error("Studio payment was not found.");
  const expectedMinor = Number(payment.amount.mul(100).toFixed(0));
  if (input.amountMinor !== undefined && input.amountMinor !== expectedMinor) throw new Error("Payment amount does not match this Studio order.");
  if (input.currency && input.currency.toUpperCase() !== payment.currency.toUpperCase()) throw new Error("Payment currency does not match this Studio order.");
  if (input.customerId !== undefined && payment.order.customerId !== input.customerId) throw new Error("Studio order not found.");
  if (payment.status === "CAPTURED") {
    if (payment.razorpayPaymentId !== input.paymentId) throw new Error("Payment was already captured with a different identifier.");
    return payment.order;
  }
  if (razorpay) await verifyCapturedRazorpayPayment({ orderId: payment.razorpayOrderId, paymentId: input.paymentId, amountMinor: expectedMinor, currency: payment.currency });
  return studioSerializable(async (tx) => {
    const current = await tx.studioPayment.findUniqueOrThrow({ where: { id: payment.id }, include: { order: { include: { serviceListing: true, engineerParty: true } } } });
    if (current.status === "CAPTURED") return current.order;
    if (current.purpose === "ADDITIONAL_REVISION") {
      if (current.order.status !== "REVISION_PAYMENT_REQUIRED") throw new Error("This revision payment is no longer applicable.");
      const revision = await tx.studioRevision.findFirstOrThrow({ where: { paymentId: current.id, orderId: current.orderId, status: "PAYMENT_REQUIRED" } });
      await tx.studioPayment.update({ where: { id: current.id }, data: { status: "CAPTURED", razorpayPaymentId: input.paymentId, capturedAt: new Date() } });
      await tx.studioRevision.update({ where: { id: revision.id }, data: { status: "REQUESTED", paymentRequired: false } });
      const updated = await tx.studioServiceOrder.update({ where: { id: current.orderId }, data: { status: "REVISION_REQUESTED" } });
      await tx.studioOrderStatusEvent.create({ data: { orderId: current.orderId, previousStatus: "REVISION_PAYMENT_REQUIRED", newStatus: "REVISION_REQUESTED", actorType: "PAYMENT", reason: `Revision #${revision.sequence} payment received`, correlationId: `payment:${input.paymentId}:revision` } });
      await tx.studioMessage.create({ data: { orderId: current.orderId, kind: "SYSTEM", body: `Revision #${revision.sequence} payment received`, idempotencyKey: `revision-payment:${input.paymentId}` } });
      await studioEvent(tx, { event: "paid_revision_purchased", key: `studio:${current.orderId}:paid-revision:${revision.sequence}`, userId: current.order.customerId, orderId: current.orderId, properties: { sequence: revision.sequence, amount: current.amount.toString() } });
      return updated;
    }
    if (current.purpose === "AMENDMENT") {
      const amendment = await tx.studioAmendment.findFirstOrThrow({ where: { paymentId: current.id, orderId: current.orderId, status: "AWAITING_PAYMENT" } });
      await tx.studioPayment.update({ where: { id: current.id }, data: { status: "CAPTURED", razorpayPaymentId: input.paymentId, capturedAt: new Date() } });
      await tx.studioAmendment.update({ where: { id: amendment.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      await tx.studioMessage.create({ data: { orderId: current.orderId, kind: "SYSTEM", body: `Scope amendment accepted: ${amendment.description}`, idempotencyKey: `amendment-payment:${input.paymentId}` } });
      return current.order;
    }
    if (current.purpose !== "INITIAL_ORDER") throw new Error("Unsupported Studio payment purpose.");
    if (current.order.status !== "AWAITING_PAYMENT") throw new Error("Studio order can no longer be paid.");
    const activeOrders = await tx.studioServiceOrder.count({ where: { engineerProfileId: current.order.engineerProfileId, id: { not: current.order.id }, status: { in: ACTIVE_STUDIO_ORDER_STATUSES } } });
    const profile = await tx.engineerProfile.findUniqueOrThrow({ where: { id: current.order.engineerProfileId }, select: { maxActiveOrders: true, availability: true, sellerState: true } });
    const atCapacity = activeOrders >= profile.maxActiveOrders || profile.availability !== "AVAILABLE" || profile.sellerState !== "ACTIVE";
    const next: StudioOrderStatus = atCapacity ? "REFUND_PENDING" : current.order.serviceListing.instantAccept ? "ACCEPTED" : "AWAITING_ENGINEER_ACCEPTANCE";
    const now = new Date();
    await tx.studioPayment.update({ where: { id: current.id }, data: { status: "CAPTURED", razorpayPaymentId: input.paymentId, capturedAt: now } });
    const updated = await tx.studioServiceOrder.update({ where: { id: current.orderId }, data: { status: next, paymentStatus: "HELD", paidAt: now, acceptedAt: next === "ACCEPTED" ? now : undefined, acceptanceExpiresAt: next === "AWAITING_ENGINEER_ACCEPTANCE" ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : undefined } });
    await tx.studioOrderStatusEvent.createMany({ data: [
      { orderId: current.orderId, previousStatus: "AWAITING_PAYMENT", newStatus: "PAID", actorType: "PAYMENT", reason: "Payment captured", correlationId: `payment:${input.paymentId}:paid` },
      { orderId: current.orderId, previousStatus: "PAID", newStatus: next, actorType: "SYSTEM", reason: atCapacity ? "Engineer capacity changed; refund required" : next === "ACCEPTED" ? "Project accepted automatically" : "Awaiting engineer acceptance", correlationId: `payment:${input.paymentId}:routing` },
    ] });
    if (!atCapacity && current.order.engineerParty.claimedByUserId) await tx.notification.upsert({ where: { eventKey: `studio:${current.orderId}:new-request` }, create: { userId: current.order.engineerParty.claimedByUserId, title: "New Studio request", body: `${current.order.projectTitle} is ready for your response.`, type: "system", href: `/studio/orders/${current.order.publicId}`, actionLabel: "Review request", eventKey: `studio:${current.orderId}:new-request` }, update: {} });
    await studioEvent(tx, { event: "studio_order_paid", key: `studio:${current.orderId}:paid`, userId: current.order.customerId, orderId: current.orderId, properties: { amount: current.amount.toString(), currency: current.currency } });
    return updated;
  });
}

export async function respondToStudioOrder(input: { orderPublicId: string; engineerUserId: number; accept: boolean }) {
  const order = await prisma.studioServiceOrder.findUnique({ where: { publicId: input.orderPublicId }, include: { engineerParty: true } });
  if (!order || order.engineerParty.claimedByUserId !== input.engineerUserId) throw new Error("Studio order not found.");
  if (order.status !== "AWAITING_ENGINEER_ACCEPTANCE") throw new Error("This Studio request is no longer awaiting a response.");
  const response = await transitionStudioOrder({ orderId: order.id, to: input.accept ? "ACCEPTED" : "REFUND_PENDING", actorUserId: input.engineerUserId, actorType: "ENGINEER", reason: input.accept ? "Engineer accepted the project" : "Engineer declined the project", correlationId: `engineer-response:${order.id}:${input.accept}` });
  if (!input.accept) return response;
  return transitionStudioOrder({ orderId: order.id, to: "AWAITING_SOURCE_FILES", actorUserId: input.engineerUserId, actorType: "ENGINEER", reason: "Upload source files to begin the project", correlationId: `engineer-response:${order.id}:source-files` });
}

export async function getStudioWorkspace(orderPublicId: string, userId: number) {
  await assertStudioParticipant(orderPublicId, userId);
  return prisma.studioServiceOrder.findUniqueOrThrow({ where: { publicId: orderPublicId }, include: {
    engineerProfile: { select: { professionalName: true, profilePhotoUrl: true, verificationState: true } },
    engineerParty: { select: { claimedByUserId: true } },
    sourceBeat: { select: { title: true } }, messages: { include: { sender: { select: { id: true, name: true, avatar: true } } }, orderBy: { createdAt: "asc" }, take: 500 },
    files: { include: { asset: { select: { id: true, safeFilename: true, mimeType: true, byteSize: true } } }, orderBy: [{ category: "asc" }, { version: "desc" }] },
    deliveries: { include: { files: { include: { studioFile: { include: { asset: { select: { id: true, safeFilename: true, mimeType: true, byteSize: true } } } } } }, revision: true }, orderBy: { version: "desc" } },
    revisions: { orderBy: { sequence: "asc" } }, statusEvents: { orderBy: { createdAt: "asc" } }, amendments: { orderBy: { createdAt: "desc" } }, review: true,
  } });
}

export async function sendStudioMessage(input: { orderPublicId: string; userId: number; body: string; idempotencyKey: string }) {
  const order = await assertStudioParticipant(input.orderPublicId, input.userId);
  if (["CANCELLED", "REFUNDED", "EXPIRED"].includes(order.status)) throw new Error("This workspace is closed.");
  return prisma.studioMessage.upsert({ where: { idempotencyKey: input.idempotencyKey }, create: { orderId: order.id, senderUserId: input.userId, body: input.body.trim(), idempotencyKey: input.idempotencyKey }, update: {} });
}

export async function createStudioDelivery(input: { orderPublicId: string; engineerUserId: number; studioFileIds: number[]; note?: string; idempotencyKey: string }) {
  return studioSerializable(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.orderPublicId}))`;
    const order = await tx.studioServiceOrder.findUnique({ where: { publicId: input.orderPublicId }, include: { engineerParty: true } });
    if (!order || order.engineerParty.claimedByUserId !== input.engineerUserId) throw new Error("Studio order not found.");
    if (!["ACCEPTED", "AWAITING_SOURCE_FILES", "IN_PROGRESS", "REVISION_REQUESTED"].includes(order.status)) throw new Error("A delivery cannot be created in the current state.");
    const existingEvent = await tx.studioOrderStatusEvent.findFirst({ where: { orderId: order.id, correlationId: input.idempotencyKey } });
    if (existingEvent) return tx.studioDelivery.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { version: "desc" } });
    const files = await tx.studioFile.findMany({ where: { id: { in: [...new Set(input.studioFileIds)] }, orderId: order.id, uploaderId: input.engineerUserId, category: "DELIVERY", status: "READY" } });
    if (!files.length || files.length !== new Set(input.studioFileIds).size) throw new Error("Every delivery file must belong to this order and engineer.");
    const version = order.currentDeliveryVersion + 1;
    const delivery = await tx.studioDelivery.create({ data: { orderId: order.id, version, note: input.note?.trim() || null, files: { create: files.map(file => ({ studioFileId: file.id, role: "MASTER" })) } } });
    const now = new Date();
    await tx.studioServiceOrder.update({ where: { id: order.id }, data: { status: "DELIVERED", currentDeliveryVersion: version, deliveredAt: now, autoCompleteAt: new Date(now.getTime() + 7 * 86400000) } });
    await tx.studioOrderStatusEvent.create({ data: { orderId: order.id, previousStatus: order.status, newStatus: "DELIVERED", actorUserId: input.engineerUserId, actorType: "ENGINEER", reason: `Engineer uploaded Delivery v${version}`, correlationId: input.idempotencyKey } });
    await tx.studioMessage.create({ data: { orderId: order.id, kind: "SYSTEM", body: `Engineer uploaded Delivery v${version}`, idempotencyKey: `delivery:${input.idempotencyKey}` } });
    await studioEvent(tx, { event: "delivery_created", key: `studio:${order.id}:delivery:${version}`, userId: input.engineerUserId, orderId: order.id, properties: { version } });
    await tx.notification.upsert({ where: { eventKey: `studio:${order.id}:delivery:${version}` }, create: { userId: order.customerId, title: `Studio delivery v${version} is ready`, body: `Listen to the latest delivery for ${order.projectTitle}.`, type: "system", href: `/studio/orders/${order.publicId}`, actionLabel: "Review delivery", eventKey: `studio:${order.id}:delivery:${version}` }, update: {} });
    return delivery;
  }, 10_000, Prisma.TransactionIsolationLevel.ReadCommitted);
}

export async function requestStudioRevision(input: { orderPublicId: string; customerId: number; deliveryId: number; feedback: string; idempotencyKey: string }) {
  return studioSerializable(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.orderPublicId}))`;
    const order = await tx.studioServiceOrder.findFirst({ where: { publicId: input.orderPublicId, customerId: input.customerId } });
    if (!order || order.status !== "DELIVERED") throw new Error("This delivery cannot be revised.");
    const existing = await tx.studioMessage.findUnique({ where: { idempotencyKey: `revision:${input.idempotencyKey}` } });
    if (existing) return tx.studioRevision.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { sequence: "desc" } });
    const delivery = await tx.studioDelivery.findFirst({ where: { id: input.deliveryId, orderId: order.id, version: order.currentDeliveryVersion } });
    if (!delivery) throw new Error("Only the current delivery can be revised.");
    const sequence = await tx.studioRevision.count({ where: { orderId: order.id } }).then(count => count + 1);
    const included = sequence <= order.includedRevisions;
    const revision = await tx.studioRevision.create({ data: { orderId: order.id, deliveryId: delivery.id, requestedById: input.customerId, sequence, feedback: input.feedback.trim(), included, paymentRequired: !included, status: included ? "REQUESTED" : "PAYMENT_REQUIRED" } });
    const next: StudioOrderStatus = included ? "REVISION_REQUESTED" : "REVISION_PAYMENT_REQUIRED";
    await tx.studioServiceOrder.update({ where: { id: order.id }, data: { status: next, activeRevisionCount: sequence, autoCompleteAt: null } });
    const body = included ? `Customer requested Revision #${sequence}` : `Additional revision #${sequence} payment required`;
    await tx.studioOrderStatusEvent.create({ data: { orderId: order.id, previousStatus: "DELIVERED", newStatus: next, actorUserId: input.customerId, actorType: "CUSTOMER", reason: body, correlationId: input.idempotencyKey } });
    await tx.studioMessage.create({ data: { orderId: order.id, kind: "SYSTEM", body, idempotencyKey: `revision:${input.idempotencyKey}` } });
    const engineer = await tx.contributorParty.findUnique({ where: { id: order.engineerPartyId }, select: { claimedByUserId: true } });
    if (included && engineer?.claimedByUserId) await tx.notification.upsert({ where: { eventKey: `studio:${order.id}:revision:${sequence}` }, create: { userId: engineer.claimedByUserId, title: `Revision #${sequence} requested`, body: input.feedback.trim().slice(0, 240), type: "system", href: `/studio/orders/${order.publicId}`, actionLabel: "Open project", eventKey: `studio:${order.id}:revision:${sequence}` }, update: {} });
    await studioEvent(tx, { event: "revision_requested", key: `studio:${order.id}:revision-requested:${sequence}`, userId: input.customerId, orderId: order.id, properties: { sequence, included } });
    return revision;
  }, 10_000, Prisma.TransactionIsolationLevel.ReadCommitted);
}

export async function approveStudioDelivery(input: { orderPublicId: string; customerId: number; idempotencyKey: string; automatic?: boolean }) {
  return studioSerializable(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.orderPublicId}))`;
    const order = await tx.studioServiceOrder.findFirst({ where: { publicId: input.orderPublicId, customerId: input.customerId }, include: { engineerParty: true } });
    if (!order || !["DELIVERED", "CUSTOMER_APPROVED", "COMPLETED"].includes(order.status)) throw new Error("This delivery cannot be approved.");
    const existing = await tx.studioEarning.findUnique({ where: { orderId: order.id } });
    if (existing) return tx.studioServiceOrder.findUniqueOrThrow({ where: { id: order.id } });
    const engineerUserId = order.engineerParty.claimedByUserId;
    if (!engineerUserId) throw new Error("Engineer payout identity is not connected.");
    const captured = await tx.studioPayment.aggregate({ where: { orderId: order.id, status: "CAPTURED", purpose: { in: ["INITIAL_ORDER", "ADDITIONAL_REVISION", "AMENDMENT"] } }, _sum: { amount: true } });
    const gross = captured._sum.amount ?? order.finalPrice;
    const commission = gross.mul(order.commissionRate).toDecimalPlaces(2);
    const net = gross.sub(commission);
    await tx.studioEarning.create({ data: { orderId: order.id, engineerPartyId: order.engineerPartyId, grossAmount: gross, commissionAmount: commission, netAmount: net, idempotencyKey: `studio-order:${order.id}:earning` } });
    const balance = await tx.artistPayoutBalance.upsert({ where: { userId: engineerUserId }, create: { userId: engineerUserId, availableBalance: net, lifetimeEarnings: net }, update: { availableBalance: { increment: net }, lifetimeEarnings: { increment: net }, lastUpdatedAt: new Date() } });
    await tx.walletTransaction.create({ data: { userId: engineerUserId, type: "studio_service_credit", amount: net, direction: "credit", referenceType: "studio_order", referenceId: String(order.id), idempotencyKey: `studio-order:${order.id}:wallet`, balanceAfter: balance.availableBalance, note: `${order.projectTitle} Studio service engineer share.` } });
    const now = new Date();
    const expiringFiles = await tx.studioFile.findMany({ where: { orderId: order.id, OR: [{ category: "SOURCE" }, { category: "DELIVERY", version: { lt: order.currentDeliveryVersion } }] }, select: { assetId: true } });
    if (expiringFiles.length) await tx.storedAsset.updateMany({ where: { id: { in: expiringFiles.map(file => file.assetId) }, retentionUntil: null }, data: { retentionUntil: new Date(now.getTime() + 90 * 86400000) } });
    const updated = await tx.studioServiceOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", paymentStatus: "RELEASED", approvedAt: now, completedAt: now, autoCompleteAt: null } });
    await tx.engineerProfile.update({ where: { id: order.engineerProfileId }, data: { completedOrderCount: { increment: 1 } } });
    const approvalCopy = input.automatic ? "Delivery auto-approved after the review window" : "Final master approved";
    await tx.studioOrderStatusEvent.createMany({ data: [{ orderId: order.id, previousStatus: "DELIVERED", newStatus: "CUSTOMER_APPROVED", actorUserId: input.automatic ? null : input.customerId, actorType: input.automatic ? "SYSTEM" : "CUSTOMER", reason: approvalCopy, correlationId: `${input.idempotencyKey}:approved` }, { orderId: order.id, previousStatus: "CUSTOMER_APPROVED", newStatus: "COMPLETED", actorType: "SYSTEM", reason: "Project completed and engineer earnings released", correlationId: `${input.idempotencyKey}:completed` }] });
    await tx.studioMessage.create({ data: { orderId: order.id, kind: "SYSTEM", body: `${approvalCopy}. Project completed.`, idempotencyKey: `approval:${input.idempotencyKey}` } });
    await tx.notification.upsert({ where: { eventKey: `studio:${order.id}:completed` }, create: { userId: engineerUserId, title: "Studio project completed", body: `Your earnings for ${order.projectTitle} are now available.`, type: "payout", href: "/payout", actionLabel: "View earnings", eventKey: `studio:${order.id}:completed` }, update: {} });
    await studioEvent(tx, { event: "final_approved", key: `studio:${order.id}:final-approved`, userId: input.customerId, orderId: order.id, properties: { automatic: Boolean(input.automatic), gross: gross.toString() } });
    return updated;
  }, 10_000, Prisma.TransactionIsolationLevel.ReadCommitted);
}

export async function runStudioAutomation(now = new Date()) {
  const [due, expired] = await Promise.all([
    prisma.studioServiceOrder.findMany({ where: { status: "DELIVERED", autoCompleteAt: { lte: now } }, select: { publicId: true, customerId: true, id: true }, take: 100 }),
    prisma.studioServiceOrder.findMany({ where: { status: "AWAITING_ENGINEER_ACCEPTANCE", acceptanceExpiresAt: { lte: now } }, select: { id: true }, take: 100 }),
  ]);
  let completed = 0;
  for (const order of due) { await approveStudioDelivery({ orderPublicId: order.publicId, customerId: order.customerId, idempotencyKey: `auto-complete:${order.id}`, automatic: true }); completed += 1; }
  let refundPending = 0;
  for (const order of expired) { await transitionStudioOrder({ orderId: order.id, to: "REFUND_PENDING", actorType: "SYSTEM", reason: "Engineer acceptance window expired", correlationId: `acceptance-expired:${order.id}` }); refundPending += 1; }
  const refunds = await prisma.studioServiceOrder.findMany({ where: { status: "REFUND_PENDING" }, include: { payments: { where: { status: "CAPTURED" } } }, take: 100 });
  let refunded = 0;
  for (const order of refunds) {
    for (const payment of order.payments) {
      if (!payment.razorpayPaymentId) continue;
      if (razorpay) await razorpay.payments.refund(payment.razorpayPaymentId, { amount: Number(payment.amount.mul(100).toFixed(0)), notes: { studioOrderId: order.publicId } });
      await prisma.$transaction(async tx => {
        const claimed = await tx.studioPayment.updateMany({ where: { id: payment.id, status: "CAPTURED" }, data: { status: "REFUNDED", refundedAt: now } });
        if (!claimed.count) return;
        await tx.studioServiceOrder.update({ where: { id: order.id }, data: { status: "REFUNDED", paymentStatus: "REFUNDED" } });
        await tx.studioOrderStatusEvent.create({ data: { orderId: order.id, previousStatus: "REFUND_PENDING", newStatus: "REFUNDED", actorType: "PAYMENT", reason: "Studio payment refunded", correlationId: `refund:${payment.id}` } });
        await tx.notification.upsert({ where: { eventKey: `studio:${order.id}:refunded` }, create: { userId: order.customerId, title: "Studio payment refunded", body: `Your payment for ${order.projectTitle} was refunded.`, type: "system", href: `/studio/orders/${order.publicId}`, eventKey: `studio:${order.id}:refunded` }, update: {} });
      });
      refunded += 1;
    }
  }
  return { completed, refundPending, refunded };
}

export async function reviewStudioOrder(input: { orderPublicId: string; customerId: number; rating: number; comment?: string }) {
  return prisma.$transaction(async tx => {
    const order = await tx.studioServiceOrder.findFirst({ where: { publicId: input.orderPublicId, customerId: input.customerId, status: "COMPLETED" } });
    if (!order) throw new Error("Only a completed Studio project can be reviewed.");
    const review = await tx.studioReview.create({ data: { orderId: order.id, customerId: input.customerId, rating: input.rating, comment: input.comment?.trim() || null } });
    const aggregate = await tx.studioReview.aggregate({ where: { order: { engineerProfileId: order.engineerProfileId }, status: "PUBLISHED" }, _avg: { rating: true }, _count: { rating: true } });
    await tx.engineerProfile.update({ where: { id: order.engineerProfileId }, data: { ratingAverage: aggregate._avg.rating ?? null, ratingCount: aggregate._count.rating } });
    return review;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelStudioOrder(input: { orderPublicId: string; customerId: number; reason: string; idempotencyKey: string }) {
  return prisma.$transaction(async tx => {
    const order = await tx.studioServiceOrder.findFirst({ where: { publicId: input.orderPublicId, customerId: input.customerId }, include: { engineerParty: true } });
    if (!order) throw new Error("Studio order not found.");
    const prior = await tx.studioOrderStatusEvent.findFirst({ where: { orderId: order.id, correlationId: input.idempotencyKey } });
    if (prior) return order;
    let next: StudioOrderStatus;
    if (["DRAFT", "AWAITING_PAYMENT"].includes(order.status)) next = "CANCELLED";
    else if (["PAID", "AWAITING_ENGINEER_ACCEPTANCE", "ACCEPTED", "AWAITING_SOURCE_FILES"].includes(order.status) && !order.startedAt) next = "REFUND_PENDING";
    else if (["IN_PROGRESS", "DELIVERED", "REVISION_PAYMENT_REQUIRED", "REVISION_REQUESTED"].includes(order.status)) next = "DISPUTED";
    else throw new Error("This Studio order can no longer be cancelled.");
    const updated = await tx.studioServiceOrder.update({ where: { id: order.id }, data: { status: next, cancelledAt: next === "CANCELLED" ? new Date() : undefined } });
    await tx.studioOrderStatusEvent.create({ data: { orderId: order.id, previousStatus: order.status, newStatus: next, actorUserId: input.customerId, actorType: "CUSTOMER", reason: input.reason.trim(), correlationId: input.idempotencyKey } });
    await tx.studioMessage.create({ data: { orderId: order.id, kind: "SYSTEM", body: next === "DISPUTED" ? "Cancellation request sent to HYMN support for review." : next === "REFUND_PENDING" ? "Order cancelled. Refund is being processed." : "Order cancelled.", idempotencyKey: `cancellation:${input.idempotencyKey}` } });
    if (order.engineerParty.claimedByUserId) await tx.notification.upsert({ where: { eventKey: `studio:${order.id}:cancel:${input.idempotencyKey}` }, create: { userId: order.engineerParty.claimedByUserId, title: next === "DISPUTED" ? "Studio cancellation needs review" : "Studio order cancelled", body: order.projectTitle, type: "system", href: `/studio/orders/${order.publicId}`, eventKey: `studio:${order.id}:cancel:${input.idempotencyKey}` }, update: {} });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function handoffStudioOrderToRelease(input: { orderPublicId: string; customerId: number; finalStudioFileId: number }) {
  const preflight = await prisma.studioServiceOrder.findFirst({ where: { publicId: input.orderPublicId, customerId: input.customerId }, include: { sourceBeat: { include: { producerParty: true, user: { select: { name: true } } } } } });
  const ensuredProducerParty = preflight?.sourceBeat && !preflight.sourceBeat.producerParty ? await ensureClaimedContributorParty(preflight.sourceBeat.userId, preflight.sourceBeat.user.name || `Producer #${preflight.sourceBeat.userId}`) : preflight?.sourceBeat?.producerParty ?? null;
  return studioSerializable(async (tx) => {
    const order = await tx.studioServiceOrder.findFirst({ where: { publicId: input.orderPublicId, customerId: input.customerId }, include: { sourceBeatPurchase: true, sourceBeat: { include: { producerParty: true } }, customer: true, engineerParty: true, releaseHandoff: true } });
    if (!order || order.status !== "COMPLETED") throw new Error("Only a completed Studio project can start a release.");
    if (order.releaseHandoff) return { releaseId: order.releaseHandoff.releaseId, href: `/distribution/start?resume=${order.releaseHandoff.releaseId}` };
    const finalFile = await tx.studioFile.findFirst({ where: { id: input.finalStudioFileId, orderId: order.id, category: "DELIVERY", deliveryFiles: { some: { delivery: { version: order.currentDeliveryVersion } } } }, include: { asset: true } });
    if (!finalFile) throw new Error("Choose a final file from the latest delivery.");
    const purchase = order.sourceBeatPurchase;
    const existingRelease = purchase?.releaseId ? await tx.release.findFirst({ where: { id: purchase.releaseId, userId: input.customerId }, include: { tracks: { orderBy: { trackNumber: "asc" }, take: 1 } } }) : null;
    let releaseId: number;
    let trackId: number;
    if (existingRelease) {
      releaseId = existingRelease.id;
      if (!existingRelease.tracks[0]) throw new Error("The existing Beat release draft has no track.");
      trackId = existingRelease.tracks[0].id;
      await tx.track.update({ where: { id: trackId }, data: { audioUrl: `/api/assets/${finalFile.assetId}/download?filename=${encodeURIComponent(finalFile.asset.safeFilename)}`, metadata: { ...((existingRelease.tracks[0].metadata as Prisma.JsonObject) || {}), finalMasterAssetId: finalFile.assetId, studioOrderId: order.publicId, studioEngineerPartyId: order.engineerParty.publicId, mixingEngineer: order.engineerParty.professionalName, masteringEngineer: order.engineerParty.professionalName } } });
    } else {
      const beat = order.sourceBeat;
      const producer = beat ? (beat.producerParty ?? ensuredProducerParty) : null;
      const release = await tx.release.create({ data: { userId: input.customerId, title: order.projectTitle, artistName: order.customer.name, genre: beat?.genre || "", releaseDate: new Date(), status: "DRAFT", releaseType: "single", paymentStatus: "pending", metadata: { studioOrderId: order.publicId, finalMasterAssetId: finalFile.assetId, ...(purchase ? { beatPurchaseId: purchase.id, license_receipt_url: purchase.licenseUrl, licenseType: purchase.licenseType, contentType: purchase.licenseType === "exclusive" ? "Exclusive Licensed" : "Non-Exclusive Licensed" } : { contentType: "Original" }) } } });
      const track = await tx.track.create({ data: { releaseId: release.id, title: order.projectTitle, trackNumber: 1, primaryArtist: order.customer.name, audioUrl: `/api/assets/${finalFile.assetId}/download?filename=${encodeURIComponent(finalFile.asset.safeFilename)}`, metadata: { finalMasterAssetId: finalFile.assetId, studioOrderId: order.publicId, studioEngineerPartyId: order.engineerParty.publicId, mixingEngineer: order.engineerParty.professionalName, masteringEngineer: order.engineerParty.professionalName, ...(producer ? { producers: producer.professionalName } : {}) } } });
      trackId = track.id;
      if (beat && purchase && producer) {
        await tx.trackContribution.upsert({ where: { trackId_partyId_role: { trackId: track.id, partyId: producer.id, role: "PRODUCER" } }, create: { trackId: track.id, partyId: producer.id, role: "PRODUCER", creditedName: producer.professionalName, legalNameSnapshot: producer.legalName, providerRole: "producer", source: "STUDIO_HANDOFF", createdByUserId: input.customerId }, update: { creditedName: producer.professionalName, legalNameSnapshot: producer.legalName, providerRole: "producer" } });
        await tx.releaseTrackBeatLink.create({ data: { trackId: track.id, beatId: beat.id, beatPurchaseId: purchase.id, producerPartyId: producer.id } });
        await tx.beatPurchase.update({ where: { id: purchase.id }, data: { releaseId: release.id, producerPartyId: producer.id } });
      }
      releaseId = release.id;
    }
    for (const role of ["MIX_ENGINEER", "MASTERING_ENGINEER"] as const) await tx.trackContribution.upsert({ where: { trackId_partyId_role: { trackId, partyId: order.engineerPartyId, role } }, create: { trackId, partyId: order.engineerPartyId, role, creditedName: order.engineerParty.professionalName, legalNameSnapshot: order.engineerParty.legalName, providerRole: null, source: "STUDIO_HANDOFF", createdByUserId: input.customerId }, update: { creditedName: order.engineerParty.professionalName, legalNameSnapshot: order.engineerParty.legalName } });
    await tx.studioReleaseHandoff.create({ data: { orderId: order.id, releaseId, beatPurchaseId: purchase?.id, beatId: order.sourceBeatId, finalStudioFileId: finalFile.id, rightsMapping: purchase ? `BEAT_LICENSE:${purchase.licenseType}` : "CUSTOMER_ORIGINAL" } });
    await tx.auditLog.create({ data: { actorId: input.customerId, action: "STUDIO_RELEASE_HANDOFF_CREATED", entity: "studio_order", entityId: String(order.id), metadata: { releaseId, finalStudioFileId: finalFile.id, beatPurchaseId: purchase?.id ?? null } } });
    await studioEvent(tx, { event: "studio_to_distribution_completed", key: `studio:${order.id}:distribution:${releaseId}`, userId: input.customerId, orderId: order.id, properties: { release_id: releaseId, beat_purchase_id: purchase?.id ?? null } });
    return { releaseId, href: `/distribution/start?resume=${releaseId}` };
  }, 15_000);
}
