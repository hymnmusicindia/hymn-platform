import 'server-only';
import { prisma } from './prisma';
import { deserializeRelease, withAmendmentStatus } from './distribution-db';
import type { Release } from './types';

export async function adminQcReviewReleaseIds() {
  const tasks = await prisma.adminTask.findMany({
    where: {
      entityType: 'release',
      type: { in: ['Distribution QC review', 'Correction review'] },
      status: { in: ['open', 'processing', 'review'] }
    },
    select: { entityId: true }
  });
  return [...new Set(tasks.map(task => Number(task.entityId)).filter(Number.isSafeInteger))];
}

export async function withAdminQcReviewTasks(releases: Release[], reviewIds?: number[]) {
  if (!releases.length) return releases;
  const pendingIds = new Set(reviewIds ?? await adminQcReviewReleaseIds());
  return releases.map(release => ({ ...release, adminQcReviewRequired: pendingIds.has(release.id) }));
}

export async function adminReleaseDelta(input: { since: Date; until: Date; afterId: number }) {
  const rows=await prisma.release.findMany({where:{updatedAt:{lte:input.until},OR:[{updatedAt:{gt:input.since}},{updatedAt:input.since,id:{gt:input.afterId}}]},orderBy:[{updatedAt:'asc'},{id:'asc'}],take:201,include:{user:{select:{email:true}},owner:{select:{email:true}},tracks:{include:{contributions:{include:{party:true},orderBy:{sequence:'asc'}}},orderBy:{trackNumber:'asc'}}}});
  const page=rows.slice(0,200),last=page.at(-1);
  const reviewIds = await adminQcReviewReleaseIds();
  const releases = await withAmendmentStatus(page.filter(row=>!row.archivedAt).map(deserializeRelease));
  return {mode:'delta',releases:await withAdminQcReviewTasks(releases,reviewIds),qcReviewReleaseIds:reviewIds,removedIds:page.filter(row=>row.archivedAt).map(row=>row.id),watermark:input.until.toISOString(),next:rows.length>200&&last?{since:last.updatedAt.toISOString(),afterId:last.id}:null};
}
