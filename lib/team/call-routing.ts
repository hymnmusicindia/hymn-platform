import 'server-only';
import type { Prisma } from '@prisma/client';
import { allocateCustomerCall } from './call-assignment';
/** Shared capacity and eligibility are rechecked inside the workspace write lock. */
export async function representativeForCall(tx: Prisma.TransactionClient, workspaceId: string, startsAt: Date, exclude: string[] = [], eventId?: string) {
  return (await allocateCustomerCall(tx, { workspaceId, after: startsAt, exact: true, exclude, eventId }))?.member || null;
}
