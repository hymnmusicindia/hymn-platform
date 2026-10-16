import { Prisma, type RouteTransfer } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertStudioPayoutClear } from "@/lib/studio-payout-guard";
import { gatewayPages, gatewayRequest } from "@/lib/gateway-provider";
import { allocateCreatorShare, minor, rupeesToMinor } from "@/lib/gateway-finance-domain";

type Product = { id: string; account_id: string; product_name: string; activation_status: string };
type Transfer = { id: string; source: string; recipient: string; amount: number; currency: string; status: string; settlement_status?: string; on_hold: boolean; amount_reversed: number; recipient_settlement_id?: string | null; notes?: Record<string, string> };
type Payment = { id: string; order_id: string; status: string; amount: number; currency: string; amount_refunded: number };
function enabled() { if (process.env.RAZORPAY_ROUTE_ENABLED !== "true") throw new Error("Route is not enabled. Activate Razorpay Route and configure linked accounts first."); }
async function verifiedAccount(accountId: string, productId: string) {
  if (!/^acc_[A-Za-z0-9]+$/.test(accountId) || !/^acc_prd_[A-Za-z0-9]+$/.test(productId)) throw new Error("Enter valid linked account and product configuration IDs.");
  const product = await gatewayRequest<Product>(`v2/accounts/${accountId}/products/${productId}`);
  if (product.id !== productId || product.account_id !== accountId || product.product_name !== "route" || product.activation_status !== "activated") throw new Error("The linked account Route product is not activated.");
  return product;
}
export async function linkRouteAccount(userId: number, accountId: string, productId: string, actorId: number | null) {
  enabled();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.status !== "ACTIVE") throw new Error("The HYMN user account must be active.");
  if (!/^acc_[A-Za-z0-9]+$/.test(accountId)) throw new Error("Invalid linked account identifier.");
  const account = await gatewayRequest<{ id: string; email: string }>(`v2/accounts/${accountId}`);
  if (account.id !== accountId || account.email?.toLowerCase() !== user.email.toLowerCase()) throw new Error("Linked account email must match the HYMN user email.");
  await verifiedAccount(accountId, productId);
  return prisma.$transaction(async tx => {
    if (await tx.routeTransfer.count({ where: { userId, status: { notIn: ["cancelled", "settled"] } } })) throw new Error("Resolve existing Route transfers before changing this account.");
    const row = await tx.routeLinkedAccount.upsert({ where: { userId }, create: { userId, accountId, productId, status: "activated", verifiedAt: new Date() }, update: { accountId, productId, status: "activated", verifiedAt: new Date() } });
    await tx.auditLog.create({ data: { actorType: "admin", actorId, action: "ROUTE_ACCOUNT_LINKED", entity: "user", entityId: String(userId), metadata: { accountId, productId } } });
    return row;
  });
}

async function allocation(tx: Prisma.TransactionClient, sourceKey: string) {
  const [kind, textId] = sourceKey.split(":"); const id = Number(textId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid earning source.");
  if (kind === "beat") {
    const sale = await tx.beatSale.findUniqueOrThrow({ where: { id } });
    const order = await tx.checkoutOrder.findUniqueOrThrow({ where: { id: sale.orderId } });
    if (sale.status !== "paid" || !sale.refundedAmount.isZero() || order.paymentStatus !== "paid" || sale.currency !== "INR" || order.currency !== "INR" || order.razorpayPaymentId !== sale.paymentId) throw new Error("Only captured, unrefunded INR sales can be routed.");
    return { userId: sale.producerUserId, createdAt: sale.createdAt, payments: [{ paymentId: sale.paymentId, orderId: order.razorpayOrderId, grossMinor: rupeesToMinor(order.finalAmount), amountMinor: rupeesToMinor(sale.producerEarningAmount) }] };
  }
  if (kind === "studio") {
    const earning = await tx.studioEarning.findUniqueOrThrow({ where: { id }, include: { engineerParty: true, order: true } });
    if (earning.status !== "AVAILABLE" || earning.order.status !== "COMPLETED" || earning.currency !== "INR" || !earning.engineerParty.claimedByUserId) throw new Error("Studio earnings must be completed, available and assigned to a HYMN account.");
    const payments = await tx.studioPayment.findMany({ where: { orderId: earning.orderId, purpose: { in: ["INITIAL_ORDER", "ADDITIONAL_REVISION", "AMENDMENT"] } }, orderBy: { id: "asc" } });
    if (!payments.length || payments.some(row => row.status !== "CAPTURED" || !row.refundedAmount.isZero() || row.currency !== "INR" || !row.razorpayPaymentId) || payments.reduce((sum, row) => sum + rupeesToMinor(row.amount), 0) !== rupeesToMinor(earning.grossAmount)) throw new Error("Studio funding does not match the earning ledger.");
    const shares = allocateCreatorShare(payments.map(row => ({ paymentId: row.razorpayPaymentId!, amountMinor: rupeesToMinor(row.amount) })), rupeesToMinor(earning.netAmount));
    return { userId: earning.engineerParty.claimedByUserId, createdAt: earning.createdAt, payments: shares.map(row => { const payment = payments.find(item => item.razorpayPaymentId === row.paymentId)!; return { ...row, orderId: payment.razorpayOrderId, grossMinor: rupeesToMinor(payment.amount) }; }) };
  }
  throw new Error("Choose a beat sale or completed studio earning.");
}
export async function reserveRouteEarning(sourceKey: string, actorId: number | null) {
  enabled();
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`route:${sourceKey}`}))`;
    const existing = await tx.routeTransfer.findMany({ where: { sourceKey } });
    if (existing.length) return existing; // A source cannot be dispatched again, including cancelled sources.
    const source = await allocation(tx, sourceKey);
    await assertStudioPayoutClear(tx, source.userId);
    const user = await tx.user.findUniqueOrThrow({ where: { id: source.userId }, select: { status: true } });
    if (user.status !== "ACTIVE") throw new Error("Creator account is not active.");
    const account = await tx.routeLinkedAccount.findUniqueOrThrow({ where: { userId: source.userId } });
    if (account.status !== "activated") throw new Error("An activated linked account is required.");
    await tx.$queryRaw`SELECT id FROM artist_payout_balances WHERE user_id = ${source.userId} FOR UPDATE`;
    // Existing wallet payouts are fungible. Historical earnings cannot be proven unspent after one.
    if (await tx.payoutRequest.count({ where: { userId: source.userId, requestedAt: { gte: source.createdAt }, status: { notIn: ["REJECTED", "FAILED", "CANCELLED"] } } })) throw new Error("This earning overlaps a wallet payout. Reconcile it before using Route.");
    const amount = new Prisma.Decimal(source.payments.reduce((sum, row) => sum + row.amountMinor, 0)).div(100);
    if (amount.lte(0)) throw new Error("No creator earnings to route.");
    const changed = await tx.artistPayoutBalance.updateMany({ where: { userId: source.userId, currency: "INR", availableBalance: { gte: amount } }, data: { availableBalance: { decrement: amount }, pendingBalance: { increment: amount }, lastUpdatedAt: new Date() } });
    if (changed.count !== 1) throw new Error("Insufficient unreserved INR wallet funds.");
    const balance = await tx.artistPayoutBalance.findUniqueOrThrow({ where: { userId: source.userId } });
    await tx.walletTransaction.create({ data: { userId: source.userId, type: "route_reservation", direction: "hold", amount: 0, referenceType: "route_earning", referenceId: sourceKey, idempotencyKey: `route:${sourceKey}:reserve`, balanceAfter: balance.availableBalance, availabilityStatus: "held", auditMetadata: { amount: amount.toString() }, note: "Creator earnings reserved for Route; unavailable for wallet withdrawal." } });
    for (const row of source.payments) await tx.routeTransfer.create({ data: { sourceKey, paymentId: row.paymentId, userId: source.userId, accountId: account.accountId, amountMinor: row.amountMinor } });
    await tx.auditLog.create({ data: { actorType: "admin", actorId, action: "ROUTE_EARNING_RESERVED", entity: "route_earning", entityId: sourceKey, metadata: { amount: amount.toString(), userId: source.userId } } });
    return tx.routeTransfer.findMany({ where: { sourceKey } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function refreshRouteTransfer(id: number): Promise<RouteTransfer> {
  const local = await prisma.routeTransfer.findUniqueOrThrow({ where: { id } });
  if (!local.transferId) {
    // A timed-out POST has an unknown outcome. Search notes; never replay it automatically.
    if (!["submitting", "review"].includes(local.status)) return local;
    const transfers = await gatewayPages<Transfer>(`v1/payments/${local.paymentId}/transfers`);
    const found = transfers.filter(row => row.notes?.hymn_intent === String(id));
    if (found.length !== 1) return prisma.routeTransfer.update({ where: { id }, data: { status: "review", error: "Transfer outcome is uncertain. Resolve with Razorpay; automatic retry is blocked." } });
    await prisma.routeTransfer.update({ where: { id }, data: { transferId: found[0].id } });
    return refreshRouteTransfer(id);
  }
  const transfer = await gatewayRequest<Transfer>(`v1/transfers/${local.transferId}`);
  if (transfer.id !== local.transferId || transfer.source !== local.paymentId || transfer.recipient !== local.accountId || minor(transfer.amount) !== local.amountMinor || transfer.currency !== "INR") throw new Error("Route transfer identity or allocation mismatch.");
  const reversed = minor(transfer.amount_reversed);
  // Linked-account settlements are not merchant bank settlements. Route exposes its own settlement state.
  const settled = Boolean(transfer.recipient_settlement_id) && transfer.settlement_status === "settled" && reversed === 0 && transfer.status === "processed";
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM route_transfers WHERE id = ${id} FOR UPDATE`;
    const current = await tx.routeTransfer.findUniqueOrThrow({ where: { id } });
    if (settled && !current.accountedAt) {
      const amount = new Prisma.Decimal(current.amountMinor).div(100);
      const balance = await tx.artistPayoutBalance.update({ where: { userId: current.userId }, data: { pendingBalance: { decrement: amount }, lifetimePaid: { increment: amount }, lastUpdatedAt: new Date() } });
      await tx.walletTransaction.create({ data: { userId: current.userId, type: "route_debit", direction: "debit", amount: amount.neg(), referenceType: "route_transfer", referenceId: String(id), idempotencyKey: `route:${id}:settled`, balanceAfter: balance.availableBalance, note: `Route transfer ${current.transferId} settled to linked account.` } });
      await tx.notification.upsert({ where: { eventKey: `route:${id}:settled` }, create: { userId: current.userId, eventKey: `route:${id}:settled`, title: "Marketplace earnings settled", body: `INR ${amount.toFixed(2)} settled to your linked account.`, type: "payout", href: "/payout", actionLabel: "View earnings" }, update: {} });
    }
    const status = reversed > 0 || transfer.status === "failed" ? "review" : settled ? "settled" : transfer.on_hold ? "held" : "processing";
    return tx.routeTransfer.update({ where: { id }, data: { status, providerStatus: transfer.status, onHold: transfer.on_hold, reversedMinor: reversed, settlementId: transfer.recipient_settlement_id || null, accountedAt: settled ? current.accountedAt || new Date() : current.accountedAt, error: status === "review" ? "Provider failure or reversal requires finance review. Funds are not automatically re-credited." : null } });
  });
}
export async function refreshRouteSettlement(settlementId: string) {
  if (!/^setl_[A-Za-z0-9]+$/.test(settlementId)) throw new Error("Invalid settlement identifier.");
  if (!await prisma.routeLinkedAccount.count()) return false;
  const remote = await gatewayPages<Transfer>(`v1/transfers?recipient_settlement_id=${settlementId}`);
  const locals = await prisma.routeTransfer.findMany({ where: { transferId: { in: remote.map(row => row.id) } } });
  for (const row of locals) await refreshRouteTransfer(row.id);
  return remote.length > 0;
}
export async function submitRouteTransfer(id: number, actorId: number | null) {
  enabled();
  let intent = await prisma.routeTransfer.findUniqueOrThrow({ where: { id } });
  if (intent.status !== "reserved") return refreshRouteTransfer(id);
  const source = await prisma.$transaction(tx => allocation(tx, intent.sourceKey));
  const funding = source.payments.find(row => row.paymentId === intent.paymentId);
  if (!funding || funding.amountMinor !== intent.amountMinor || source.userId !== intent.userId) throw new Error("The earning allocation changed. Finance review is required.");
  if ((await prisma.user.findUniqueOrThrow({ where: { id: intent.userId }, select: { status: true } })).status !== "ACTIVE") throw new Error("Creator account is not active.");
  const account = await prisma.routeLinkedAccount.findUniqueOrThrow({ where: { userId: intent.userId } });
  if (account.accountId !== intent.accountId) throw new Error("Linked account changed.");
  await verifiedAccount(account.accountId, account.productId);
  const payment = await gatewayRequest<Payment>(`v1/payments/${intent.paymentId}`);
  if (payment.id !== intent.paymentId || payment.order_id !== funding.orderId || payment.status !== "captured" || payment.currency !== "INR" || minor(payment.amount) !== funding.grossMinor || minor(payment.amount_refunded) !== 0) throw new Error("Provider payment is not captured, fully funded and unrefunded.");
  // Lock each payment's dispatch. Never create alongside unmanaged external transfers.
  const external = await gatewayPages<Transfer>(`v1/payments/${intent.paymentId}/transfers`);
  const managed = await prisma.routeTransfer.findMany({ where: { paymentId: intent.paymentId, transferId: { not: null } } });
  if (external.some(row => !managed.some(local => local.transferId === row.id))) throw new Error("Unmanaged transfers exist for this payment; reconcile them first.");
  if (external.reduce((sum, row) => sum + minor(row.amount), 0) + intent.amountMinor > funding.grossMinor) throw new Error("Transfer would exceed the captured amount.");
  const claimed = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`route:${intent.sourceKey}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`route-payment:${intent.paymentId}`}))`;
    if (await tx.routeTransfer.count({ where: { paymentId: intent.paymentId, id: { not: id }, status: { in: ["submitting", "review"] } } })) throw new Error("Another transfer for this payment needs reconciliation.");
    await allocation(tx, intent.sourceKey);
    await assertStudioPayoutClear(tx, intent.userId);
    return tx.routeTransfer.updateMany({ where: { id, status: "reserved" }, data: { status: "submitting", error: null } });
  });
  if (claimed.count !== 1) return refreshRouteTransfer(id);
  try {
    const result = await gatewayRequest<{ items: Transfer[] }>(`v1/payments/${intent.paymentId}/transfers`, "POST", { transfers: [{ account: intent.accountId, amount: intent.amountMinor, currency: "INR", on_hold: true, notes: { hymn_intent: String(id), hymn_source: intent.sourceKey } }] });
    const transfer = result.items?.find(row => row.notes?.hymn_intent === String(id));
    if (!transfer?.id) throw new Error("Provider did not return the Route transfer.");
    intent = await prisma.routeTransfer.update({ where: { id }, data: { transferId: transfer.id } });
    await prisma.auditLog.create({ data: { actorType: "admin", actorId, action: "ROUTE_TRANSFER_CREATED", entity: "route_transfer", entityId: String(id), metadata: { transferId: intent.transferId, amountMinor: intent.amountMinor } } });
    return await refreshRouteTransfer(id);
  } catch (error) {
    await prisma.routeTransfer.update({ where: { id }, data: { status: "review", error: "Dispatch needs reconciliation. No automatic repeat transfer will be attempted." } });
    throw error;
  }
}
export async function releaseRouteTransfer(id: number, actorId: number | null) {
  enabled(); const intent = await refreshRouteTransfer(id);
  if (!intent.transferId || intent.status !== "held" || intent.reversedMinor > 0) throw new Error("Only verified, unreversed held transfers can be released.");
  await prisma.$transaction(async tx => { await allocation(tx, intent.sourceKey); await assertStudioPayoutClear(tx, intent.userId); });
  if ((await prisma.user.findUniqueOrThrow({ where: { id: intent.userId }, select: { status: true } })).status !== "ACTIVE") throw new Error("Creator account is not active.");
  const account = await prisma.routeLinkedAccount.findUniqueOrThrow({ where: { userId: intent.userId } });
  await verifiedAccount(account.accountId, account.productId);
  const payment = await gatewayRequest<Payment>(`v1/payments/${intent.paymentId}`);
  if (payment.status !== "captured" || minor(payment.amount_refunded) !== 0) throw new Error("Payment has been refunded or is not captured.");
  await gatewayRequest(`v1/transfers/${intent.transferId}`, "PATCH", { on_hold: false });
  await prisma.auditLog.create({ data: { actorType: "admin", actorId, action: "ROUTE_TRANSFER_RELEASED", entity: "route_transfer", entityId: String(id), metadata: { transferId: intent.transferId } } });
  return refreshRouteTransfer(id);
}
export async function cancelRouteReservation(id: number, actorId: number | null) {
  return prisma.$transaction(async tx => {
    const row = await tx.routeTransfer.findUniqueOrThrow({ where: { id } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`route:${row.sourceKey}`}))`;
    const source = await allocation(tx, row.sourceKey);
    const rows = await tx.routeTransfer.findMany({ where: { sourceKey: row.sourceKey } });
    if (rows.some(item => item.status !== "reserved" || item.transferId)) throw new Error("Only a source with no attempted transfers can be cancelled.");
    const amount = new Prisma.Decimal(rows.reduce((sum, item) => sum + item.amountMinor, 0)).div(100);
    const balance = await tx.artistPayoutBalance.update({ where: { userId: source.userId }, data: { availableBalance: { increment: amount }, pendingBalance: { decrement: amount }, lastUpdatedAt: new Date() } });
    await tx.walletTransaction.create({ data: { userId: source.userId, type: "route_reservation_release", direction: "release", amount: 0, referenceType: "route_earning", referenceId: row.sourceKey, idempotencyKey: `route:${row.sourceKey}:cancel`, balanceAfter: balance.availableBalance, note: "Unsubmitted Route reservation cancelled." } });
    await tx.routeTransfer.updateMany({ where: { sourceKey: row.sourceKey, status: "reserved" }, data: { status: "cancelled" } });
    await tx.auditLog.create({ data: { actorType: "admin", actorId, action: "ROUTE_RESERVATION_CANCELLED", entity: "route_earning", entityId: row.sourceKey } });
  });
}
export async function routeWorkspace() {
  const [accounts, transfers, sales, studio] = await Promise.all([
    prisma.routeLinkedAccount.findMany({ include: { user: { select: { name: true, email: true } } } }),
    prisma.routeTransfer.findMany({ include: { user: { select: { name: true, email: true } } }, orderBy: { id: "desc" }, take: 200 }),
    prisma.beatSale.findMany({ where: { status: "paid", refundedAmount: 0, currency: "INR" }, include: { producer: { select: { name: true, email: true } } }, orderBy: { id: "desc" }, take: 200 }),
    prisma.studioEarning.findMany({ where: { status: "AVAILABLE", currency: "INR", order: { status: "COMPLETED" } }, include: { engineerParty: { select: { claimedByUserId: true, professionalName: true } } }, orderBy: { id: "desc" }, take: 200 }),
  ]);
  const sources = [...sales.map(row => ({ key: `beat:${row.id}`, label: `Beat sale #${row.id}`, userId: row.producerUserId, name: row.producer.name || row.producer.email, amountMinor: rupeesToMinor(row.producerEarningAmount) })), ...studio.map(row => ({ key: `studio:${row.id}`, label: `Studio earning #${row.id}`, userId: row.engineerParty.claimedByUserId, name: row.engineerParty.professionalName, amountMinor: rupeesToMinor(row.netAmount) }))];
  const sourceKeys = sources.map(row => row.key);
  const reserved = await prisma.routeTransfer.findMany({ where: { sourceKey: { in: sourceKeys } }, select: { sourceKey: true } });
  return { enabled: process.env.RAZORPAY_ROUTE_ENABLED === "true", accounts, transfers, sources: sources.filter(row => !reserved.some(item => item.sourceKey === row.key)), limit: 200 };
}
