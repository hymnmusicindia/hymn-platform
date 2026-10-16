import { Prisma } from "@prisma/client";

export async function assertStudioPayoutClear(tx: Prisma.TransactionClient, userId: number) {
  const balance = await tx.artistPayoutBalance.findUnique({ where: { userId }, select: { availableBalance: true } });
  if (balance?.availableBalance.lt(0)) throw new Error("Resolve the negative wallet balance before releasing funds.");
  const orders = await tx.studioServiceOrder.findMany({ where: { engineerParty: { claimedByUserId: userId }, earning: { isNot: null } }, select: { id: true, status: true, earning: { select: { heldNetAmount: true } } } });
  if (orders.some(order => order.status === "DISPUTED" || order.earning?.heldNetAmount.gt(0)) || await tx.adminTask.count({ where: { eventKey: { in: orders.map(order => `studio-finance:${order.id}`) }, status: { not: "resolved" } } })) throw new Error("Resolve Studio financial review before releasing payouts or Route transfers.");
}
