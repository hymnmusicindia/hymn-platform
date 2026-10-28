import 'server-only';
import { prisma } from './prisma';

/** Durable fraud records are authoritative even if editable release metadata
 * does not contain a matching flag. Low-risk informational alerts do not block. */
export async function automaticReleaseRiskHold(releaseId: number,userId: number) {
  const alert=await prisma.fraudAlert.findFirst({where:{status:{in:['new','under_review','escalated','monitoring','action_required']},severity:{in:['high','critical']},OR:[{entityType:'release',entityId:String(releaseId)},{userId}]},select:{id:true}});
  return Boolean(alert);
}
