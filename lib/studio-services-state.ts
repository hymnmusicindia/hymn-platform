import { StudioOrderStatus } from "@prisma/client";

const transitions: Record<StudioOrderStatus, readonly StudioOrderStatus[]> = {
  DRAFT: ["AWAITING_PAYMENT", "CANCELLED"],
  AWAITING_PAYMENT: ["PAID", "CANCELLED", "EXPIRED"],
  PAID: ["AWAITING_ENGINEER_ACCEPTANCE", "ACCEPTED", "REFUND_PENDING"],
  AWAITING_ENGINEER_ACCEPTANCE: ["ACCEPTED", "REFUND_PENDING", "EXPIRED"],
  ACCEPTED: ["AWAITING_SOURCE_FILES", "IN_PROGRESS", "REFUND_PENDING"],
  AWAITING_SOURCE_FILES: ["IN_PROGRESS", "REFUND_PENDING"],
  IN_PROGRESS: ["DELIVERED", "REFUND_PENDING", "DISPUTED"],
  DELIVERED: ["REVISION_REQUESTED", "REVISION_PAYMENT_REQUIRED", "CUSTOMER_APPROVED", "COMPLETED", "DISPUTED"],
  REVISION_PAYMENT_REQUIRED: ["REVISION_REQUESTED", "CUSTOMER_APPROVED", "DISPUTED"],
  REVISION_REQUESTED: ["IN_PROGRESS", "DELIVERED", "DISPUTED"],
  CUSTOMER_APPROVED: ["COMPLETED", "DISPUTED"],
  COMPLETED: [],
  CANCELLED: [],
  REFUND_PENDING: ["REFUNDED", "DISPUTED"],
  REFUNDED: [],
  DISPUTED: ["IN_PROGRESS", "COMPLETED", "REFUND_PENDING", "REFUNDED"],
  EXPIRED: [],
};

export function canTransitionStudioOrder(from: StudioOrderStatus, to: StudioOrderStatus) {
  return transitions[from].includes(to);
}

export function assertStudioOrderTransition(from: StudioOrderStatus, to: StudioOrderStatus) {
  if (!canTransitionStudioOrder(from, to)) {
    throw new Error(`Invalid Studio order transition: ${from} -> ${to}`);
  }
}

export const ACTIVE_STUDIO_ORDER_STATUSES: StudioOrderStatus[] = [
  "PAID", "AWAITING_ENGINEER_ACCEPTANCE", "ACCEPTED", "AWAITING_SOURCE_FILES",
  "IN_PROGRESS", "DELIVERED", "REVISION_PAYMENT_REQUIRED", "REVISION_REQUESTED",
];
