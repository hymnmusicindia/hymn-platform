import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { meaningfulDraftTitle } from "./draft-policy";
import { enqueueRenderedEmail } from "./email/release-outbox";
import { draftReminderContent } from "./email/draft-release-reminder";
import { FIRST_RELEASE_PROMOTION_CODE, getFirstReleaseEligibility } from "./first-release-promotion";
import { getPublicAppUrl } from "./public-app-url";
export const DRAFT_WARNING_TEMPLATE = "release_draft_expiry_v2";
const DAY = 86400000;
const eligible = { status: "DRAFT", archivedAt: null, releaseSource: "CUSTOMER_SUBMISSION", customerEditable: true, OR: [{ paymentStatus: null }, { paymentStatus: { not: "paid" } }], distributionSubmissions: { none: {} }, distributionOrder: { is: null }, statusTransitions: { none: { newStatus: { in: ["SUBMITTED", "UNDER_REVIEW", "LIVE"] } } } } satisfies Prisma.ReleaseWhereInput;
export async function archiveLifecycleDraft(id: number, snapshot: Date, reason: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${id}::integer)`;
    const current = await tx.release.findFirst({ where: { ...eligible, id }, select: { id: true, lastEditedAt: true, createdAt: true, title: true } });
    if (!current || (current.lastEditedAt ?? current.createdAt).getTime() !== snapshot.getTime()) return false;
    if (reason === "untitled" && meaningfulDraftTitle(current.title)) return false;
    const changed = await tx.release.updateMany({ where: { ...eligible, id }, data: { status: "ARCHIVED", archivedAt: new Date(), version: { increment: 1 } } });
    if (!changed.count) return false;
    await tx.auditLog.create({ data: { actorType: "system", action: "DRAFT_LIFECYCLE_ARCHIVED", entity: "release", entityId: String(id), metadata: { reason, recoverable: true, draftEditedAt: snapshot.toISOString() } } });
    return true;
  }, { timeout: 15000 });
}
export async function runDraftLifecycle(options: { untitledOnly?: boolean; apply?: boolean; now?: Date } = {}) {
  const now = options.now ?? new Date(), deadline = Date.now() + 35000;
  const drafts = await prisma.release.findMany({ where: eligible, include: { user: { select: { name: true, email: true, status: true } }, _count: { select: { tracks: true } } }, orderBy: { id: "asc" } });
  const untitled = drafts.filter(d => !meaningfulDraftTitle(d.title));
  if (!options.apply) return { candidates: untitled.map(d => ({ id: d.id, title: d.title })), archived: 0, warningsQueued: 0 };
  let archived = 0, warningsQueued = 0;
  for (const draft of options.untitledOnly ? untitled : drafts) {
    if (Date.now() >= deadline) break;
    const edited = draft.lastEditedAt ?? draft.createdAt;
    if (!meaningfulDraftTitle(draft.title)) { if (await archiveLifecycleDraft(draft.id, edited, "untitled")) archived++; continue; }
    if (draft.user.status !== "ACTIVE" || now.getTime() - edited.getTime() < 4 * DAY) continue;
    const eventKey = `${DRAFT_WARNING_TEMPLATE}:${draft.id}:${edited.getTime()}`;
    const warning = await prisma.emailLog.findUnique({ where: { eventKey } });
    if (now.getTime() - edited.getTime() >= 6 * DAY && warning?.status === "sent" && warning.sentAt && now.getTime() - warning.sentAt.getTime() >= 2 * DAY) {
      if (await archiveLifecycleDraft(draft.id, edited, "six_days_inactive_after_notice")) archived++;
      continue;
    }
    const meta = (draft.metadata ?? {}) as Record<string, unknown>;
    const free = meta.promotionCode === FIRST_RELEASE_PROMOTION_CODE && draft.releaseType === "single" && draft._count.tracks <= 1 && (await getFirstReleaseEligibility(draft.userId, draft.id)).eligible;
    const content = draftReminderContent(draft.user.name, draft.title, `${getPublicAppUrl()}/distribution/start?edit=${draft.id}`, free);
    await enqueueRenderedEmail(prisma, { ...content, eventKey, template: DRAFT_WARNING_TEMPLATE, to: draft.user.email, userId: draft.userId, releaseId: draft.id, expectedStatus: "DRAFT", draftEditedAt: edited.toISOString() });
    if (!warning) warningsQueued++;
  }
  return { archived, warningsQueued, checked: drafts.length };
}
