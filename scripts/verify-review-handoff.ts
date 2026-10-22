import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { finalizeReleaseReviewHandoff, repairPendingReviewHandoffs } from '../lib/release-review-handoff';
import { getDetailedReleaseById, listAllDetailedReleases, updatePaidDistributionRelease, updateDetailedReleaseStatus } from '../lib/distribution-db';
import { effectiveReleaseStatus } from '../lib/release-status-presentation';

async function main() {
  assert.equal(process.env.DATABASE_URL,'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  const original = globalThis.fetch; globalThis.fetch = async () => { throw Error('Network forbidden in review handoff fixture'); };
  try {
    const user = await prisma.user.create({data:{email:'handoff@fixture.invalid',name:'Review fixture',googleId:'handoff-fixture',status:'ACTIVE'}});
    const create = (title:string,status:'CHANGES_REQUESTED'|'UNDER_REVIEW'='CHANGES_REQUESTED') => prisma.release.create({data:{userId:user.id,title,artistName:'Fixture artist',genre:'Pop',releaseDate:new Date('2026-10-25'),status,paymentStatus:'paid',upc:'198079895303',direNoteStatus:'changes_required',metadata:{releaseTitle:title,releaseDate:'2026-10-25',autoQc:{status:'passed'},licenseReceiptUrl:'/api/assets/98/download'},tracks:{create:{title:'Fixture track',trackNumber:1,primaryArtist:'Fixture artist',audioUrl:'https://cdn.example.test/audio.wav',isrc:'INDN22602494'}}},include:{tracks:true}});
    const release = await create('Corrected EP fixture');
    const attempt = await prisma.distributionSubmissionAttempt.create({data:{releaseId:release.id,isCurrent:true,state:'submitted',providerStatus:'changes_required',idempotencyKey:'handoff-original',payloadHash:'original',upc:release.upc,corrections:{status:'open'},payloadRedacted:{albumname:release.title,upc:release.upc}}});
    const before = (await getDetailedReleaseById(release.id))!;
    const saved = await updatePaidDistributionRelease({releaseId:release.id,userId:user.id,submissionKey:'handoff-exact-payload',deferStatusNotifications:true,metadata:{...before,licenseReceiptUrl:'/api/assets/99/download',tracks:before.tracks!}});
    assert.equal(saved?.status,'under_review'); assert.equal(saved?.licenseReceiptUrl,'/api/assets/99/download');
    assert.equal(effectiveReleaseStatus(saved!.status,saved!.direNoteStatus),'under_review','Old provider correction cannot hide a new review.');
    assert((await listAllDetailedReleases()).some(r=>r.id===release.id && r.status==='under_review'));
    assert.equal((await prisma.distributionQueueEntry.findUniqueOrThrow({where:{releaseId:release.id}})).currentStage,'quality_check');
    const eventKey=`release:${release.id}:correction-review:handoff-exact-payload`;
    assert.equal((await prisma.adminTask.findUniqueOrThrow({where:{eventKey}})).status,'open');
    assert.equal((await prisma.release.findUniqueOrThrow({where:{id:release.id}})).upc,release.upc);
    assert.equal((await prisma.track.findUniqueOrThrow({where:{id:release.tracks[0].id}})).isrc,release.tracks[0].isrc);
    assert.equal((await prisma.distributionSubmissionAttempt.findUniqueOrThrow({where:{id:attempt.id}})).state,'submitted');
    assert.equal(((await prisma.distributionSubmissionAttempt.findUniqueOrThrow({where:{id:attempt.id}})).corrections as any).status,'customer_resolved');
    assert.equal((saved!.metadata?.autoQc as {status:string}).status,'manual_review_required','An old auto-QC pass cannot approve changed rights evidence.');
    const messages=await prisma.emailLog.count({where:{userId:user.id}});const notices=await prisma.notification.count({where:{userId:user.id}});
    await prisma.$transaction(tx=>finalizeReleaseReviewHandoff(tx,{releaseId:release.id,userId:user.id,submissionKey:'handoff-exact-payload'}));
    assert.equal(await prisma.emailLog.count({where:{userId:user.id}}),messages);assert.equal(await prisma.notification.count({where:{userId:user.id}}),notices);
    await updateDetailedReleaseStatus(release.id,'approved','Rights evidence checked by HYMN.',undefined,{notify:false});
    assert.equal((await prisma.adminTask.findUniqueOrThrow({where:{eventKey}})).status,'resolved');
    const failed = await create('Rollback fixture');
    await assert.rejects(prisma.$transaction(async tx=>{await tx.release.update({where:{id:failed.id},data:{title:'Must roll back'}});await finalizeReleaseReviewHandoff(tx,{releaseId:failed.id,userId:user.id,submissionKey:'rollback'});throw Error('Injected handoff failure');}),/Injected/);
    assert.equal((await prisma.release.findUniqueOrThrow({where:{id:failed.id}})).title,failed.title);
    assert.equal((await prisma.release.findUniqueOrThrow({where:{id:failed.id}})).status,'CHANGES_REQUESTED');
    assert.equal(await prisma.distributionQueueEntry.count({where:{releaseId:failed.id}}),0);
    assert.equal(await prisma.adminTask.count({where:{eventKey:`release:${failed.id}:correction-review:rollback`}}),0);
    const legacy=await create('Saved receipt missing handoff','UNDER_REVIEW');
    await prisma.release.update({where:{id:legacy.id},data:{metadata:{correctionSubmissionKey:'legacy-key',autoQc:{status:'passed'}}}});
    assert.equal(await repairPendingReviewHandoffs(),1);assert.equal(await repairPendingReviewHandoffs(),0);
    assert.equal((await prisma.adminTask.findUniqueOrThrow({where:{eventKey:`release:${legacy.id}:correction-review:legacy-key`}})).status,'open');
    assert.equal(await prisma.distributionSubmissionAttempt.count({where:{releaseId:release.id}}),1,'Repair must not create a duplicate provider delivery.');
    console.log('PASS correction review handoff: atomic metadata/status/queue/task/receipt, real admin catalogue, licence evidence, immutable codes and delivery, replay, rollback, review completion and legacy recovery.');
  } finally { globalThis.fetch=original; }
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
