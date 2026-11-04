import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { CONTENT_ID_REQUEST_FEE } from "@/lib/content-id-access";
import { contentIdLiveTrackCountsQuery, contentIdReviewReadiness, type ContentIdLiveTrackCount } from "@/lib/content-id-review-eligibility";

const reviewSchema = z.object({
  action: z.enum(["approve", "keep_pending", "decline"]),
  reason: z.string().trim().max(2000).optional()
}).superRefine((value, context) => {
  if (value.action === "decline" && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "A decline reason is required." });
  }
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("releases.review");
  if ("error" in admin) return admin.error;

  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Valid Content ID request is required." }, { status: 400 });

  let body: z.infer<typeof reviewSchema>;
  try {
    body = reviewSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : "Invalid review request." }, { status: 400 });
  }

  const actorId = "sub" in admin ? Number(admin.sub) || null : null;
  const actorRole = "adminRole" in admin ? String(admin.adminRole) : "admin";

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM content_id_access WHERE id = ${id} FOR UPDATE`;
      const current = await tx.contentIdAccess.findUnique({
        where: { id },
        include: { distributionOrder: true }
      });
      if (!current) return { error: "Content ID request not found.", status: 404 };
      if (current.status !== "pending") return { error: "This request is no longer pending.", status: 409 };
      const countQuery = contentIdLiveTrackCountsQuery([current.userId]);
      const liveTrackCounts = countQuery ? await tx.$queryRaw<ContentIdLiveTrackCount[]>(countQuery) : [];
      const reviewReadiness = contentIdReviewReadiness(liveTrackCounts[0]?.liveTrackCount ?? 0);
      if (!reviewReadiness.ready) {
        return {
          error: `Review cannot start until at least ${reviewReadiness.requiredTrackCount} tracks are confirmed live through HYMN Music (${reviewReadiness.liveTrackCount}/${reviewReadiness.requiredTrackCount} so far).`,
          status: 409
        };
      }
      if (!current.distributionOrder || current.distributionOrder.paymentStatus !== "paid") {
        return { error: "A confirmed Content ID request payment or Yearly+ entitlement is required before review.", status: 409 };
      }
      const quoteSnapshot = current.distributionOrder.quoteSnapshot;
      const quotedAccessFee = quoteSnapshot && typeof quoteSnapshot === "object" && !Array.isArray(quoteSnapshot)
        ? Number((quoteSnapshot as Record<string, unknown>).youtubeContentIdAddon)
        : 0;
      const quote = quoteSnapshot && typeof quoteSnapshot === "object" && !Array.isArray(quoteSnapshot)
        ? quoteSnapshot as Record<string, unknown>
        : null;
      const paidRequestFee = [200, CONTENT_ID_REQUEST_FEE].includes(current.feeAmount) && quotedAccessFee === current.feeAmount;
      const yearlyPlusWaiver = current.feeAmount === 0
        && quotedAccessFee === 0
        && quote?.contentIdIncludedByYearlyPlus === true
        && quote?.youtubeContentIdEnabled === true;
      if (current.distributionOrder.currency !== "INR" || (!paidRequestFee && !yearlyPlusWaiver)) {
        return { error: "The linked checkout does not contain a verified Content ID fee or Yearly+ waiver.", status: 409 };
      }

      if (body.action === "keep_pending") {
        await tx.auditLog.create({
          data: {
            actorType: "admin",
            actorId,
            actorRole,
            action: "CONTENT_ID_ACCESS_KEPT_PENDING",
            entity: "content_id_access",
            entityId: String(id),
            reason: body.reason || "Request remains pending for further review.",
            metadata: { userId: current.userId, releaseId: current.releaseId }
          }
        });
        return { request: current };
      }

      const status = body.action === "approve" ? "approved" : "declined";
      const changed = await tx.contentIdAccess.updateMany({
        where: { id, status: "pending" },
        data: { status, reviewedAt: new Date(), reviewedById: actorId, reviewReason: body.reason || null }
      });
      if (changed.count !== 1) return { error: "This request changed during review. Refresh and try again.", status: 409 };

      if (status === "approved") {
        const releaseChanged = await tx.$executeRaw`
          UPDATE releases
          SET youtube_content_id_enabled = TRUE,
              metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{youtubeContentIdEnabled}', 'true'::jsonb, TRUE),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${current.releaseId} AND user_id = ${current.userId}
        `;
        if (releaseChanged !== 1) throw new Error("The requested release is no longer available for this account.");
      }

      const action = status === "approved" ? "CONTENT_ID_ACCESS_APPROVED" : "CONTENT_ID_ACCESS_DECLINED";
      const row = await tx.contentIdAccess.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorType: "admin",
          actorId,
          actorRole,
          action,
          entity: "content_id_access",
          entityId: String(id),
          previousValue: { status: "pending" },
          newValue: { status },
          reason: body.reason || null,
          metadata: { userId: current.userId, releaseId: current.releaseId, distributionOrderId: current.distributionOrderId }
        }
      });
      await tx.notification.create({
        data: {
          userId: current.userId,
          title: status === "approved" ? "YouTube Content ID is enabled" : "YouTube Content ID request update",
          body: status === "approved"
            ? "HYMN approved your Content ID access. Eligible YouTube releases will now be selected automatically."
            : `HYMN declined your Content ID request${body.reason ? `: ${body.reason}` : "."}`,
          type: "account",
          href: "/dashboard?tab=content-id",
          actionLabel: "View Content ID",
          eventKey: `content-id:${id}:${status}:${Date.now()}`
        }
      });
      return { request: row };
    });

    if ("error" in updated) return NextResponse.json({ error: updated.error }, { status: updated.status });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Content ID request review failed", { requestId: id, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update this Content ID request." }, { status: 500 });
  }
}
