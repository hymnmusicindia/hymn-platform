import { Prisma } from "@prisma/client";

export const CONTENT_ID_REVIEW_TRACK_THRESHOLD = 5;

export type ContentIdLiveTrackCount = {
  userId: number;
  liveTrackCount: number;
};

export function contentIdReviewReadiness(liveTrackCount: number) {
  const safeCount = Number.isFinite(liveTrackCount) ? Math.max(0, Math.floor(liveTrackCount)) : 0;
  return {
    liveTrackCount: safeCount,
    requiredTrackCount: CONTENT_ID_REVIEW_TRACK_THRESHOLD,
    ready: safeCount >= CONTENT_ID_REVIEW_TRACK_THRESHOLD
  };
}

export function contentIdLiveTrackCountsQuery(userIds: number[]) {
  const ids = [...new Set(userIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return null;

  return Prisma.sql`
    SELECT r.user_id AS "userId", COUNT(t.id)::int AS "liveTrackCount"
    FROM releases r
    JOIN tracks t ON t.release_id = r.id
    WHERE r.user_id IN (${Prisma.join(ids)})
      AND r.archived_at IS NULL
      AND (
        r.status = 'LIVE'
        OR (
          r.status = 'PARTIALLY_LIVE'
          AND LOWER(COALESCE(t.distributor_status, '')) IN ('live', 'released', 'distributed')
        )
      )
    GROUP BY r.user_id
  `;
}
