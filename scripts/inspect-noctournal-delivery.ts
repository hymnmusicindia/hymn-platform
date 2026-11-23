import { PrismaClient } from '@prisma/client';

async function main() {
  process.loadEnvFile('.env.hostinger');
  const db = new PrismaClient({ log: [] });
  try {
    const releases = await db.release.findMany({ where: { OR: ['NOCTOURNAL', 'NOCTURNAL'].map(title => ({ title: { contains: title, mode: 'insensitive' as const } })) }, select: { id:true,title:true,status:true,version:true,createdAt:true,updatedAt:true,reviewedAt:true,paymentStatus:true,metadata:true,distributorReleaseId:true,upc:true,direNoteSyncError:true } });
    for (const release of releases) {
      const m = release.metadata as Record<string,unknown> | null;
      const attempts = await db.distributionSubmissionAttempt.findMany({where:{releaseId:release.id},orderBy:{id:'desc'},take:8,select:{id:true,state:true,providerReference:true,startedAt:true,completedAt:true,isCurrent:true}});
      const transitions = await db.releaseStatusTransition.findMany({where:{releaseId:release.id},orderBy:{createdAt:'desc'},take:12,select:{previousStatus:true,newStatus:true,reason:true,createdAt:true}});
      const logs = await db.direNoteLog.findMany({where:{releaseId:release.id},orderBy:{createdAt:'desc'},take:12,select:{action:true,success:true,httpStatus:true,createdAt:true}});
      console.log(JSON.stringify({release:{...release,metadata:undefined},deliveryPreparation:m?.deliveryPreparation,attempts,transitions:transitions.slice(0,4).map(t=>({...t,reason:t.reason?.slice(0,280)})),logs:logs.slice(0,3)},null,2));
    }
    const runs = await db.auditLog.findMany({where:{action:'CRON_RUN_FINISHED',entity:'cron_job'},orderBy:{createdAt:'desc'},take:8,select:{entityId:true,createdAt:true,metadata:true}});
    console.log(JSON.stringify({runs},null,2));
  } finally { await db.$disconnect(); }
}
main().catch(()=>{ console.error('Read-only inspection failed; credentials withheld.');process.exitCode=1; });
