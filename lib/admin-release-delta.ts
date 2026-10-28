import 'server-only';
import { prisma } from './prisma';
import { deserializeRelease, withAmendmentStatus } from './distribution-db';

export async function adminReleaseDelta(input: { since: Date; until: Date; afterId: number }) {
  const rows=await prisma.release.findMany({where:{updatedAt:{lte:input.until},OR:[{updatedAt:{gt:input.since}},{updatedAt:input.since,id:{gt:input.afterId}}]},orderBy:[{updatedAt:'asc'},{id:'asc'}],take:201,include:{user:{select:{email:true}},owner:{select:{email:true}},tracks:{include:{contributions:{include:{party:true},orderBy:{sequence:'asc'}}},orderBy:{trackNumber:'asc'}}}});
  const page=rows.slice(0,200),last=page.at(-1);
  return {mode:'delta',releases:await withAmendmentStatus(page.filter(row=>!row.archivedAt).map(deserializeRelease)),removedIds:page.filter(row=>row.archivedAt).map(row=>row.id),watermark:input.until.toISOString(),next:rows.length>200&&last?{since:last.updatedAt.toISOString(),afterId:last.id}:null};
}
