import { createNotification } from "@/lib/db";
import type { NotificationPriority, NotificationType } from "@/lib/types";

export type NotificationEventInput = {
  eventKey: string;
  userId: number;
  title: string;
  body: string;
  type: NotificationType;
  href?: string | null;
  actionLabel?: string | null;
  priority?: NotificationPriority;
  metadata?: Record<string, unknown> | null;
};

export async function createNotificationOnce(input: NotificationEventInput) {
  if (!input.eventKey.trim()) throw new Error("Notification eventKey is required.");
  return createNotification({ ...input, eventKey: input.eventKey.trim(), priority: input.priority ?? "normal" });
}
