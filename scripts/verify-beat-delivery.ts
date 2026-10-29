import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {prisma} from '../lib/prisma';
import {localPrivateStorage} from '../lib/private-storage';
import {purchaseAttachments} from '../lib/email/purchase-attachments';

async function main(){
  assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:/,'Use an isolated database');
  const stamp=Date.now();
  const user=await prisma.user.create({data:{name:'Delivery Buyer',email:`delivery-${stamp}@example.test`,googleId:`delivery-${stamp}`,status:'ACTIVE'}});
  const producer=await prisma.user.create({data:{name:'Delivery Producer',email:`delivery-producer-${stamp}@example.test`,googleId:`delivery-producer-${stamp}`,status:'ACTIVE'}});
  await prisma.artistCard.create({data:{userId:user.id,artistName:'Delivery Artist'}});
  const beat=await prisma.beat.create({data:{userId:producer.id,title:'Ready before email',bpm:100,genre:'Hip Hop',mood:'Chill',keySignature:'C Minor',priceCents:10000,status:'PUBLISHED',enabled:true}});
  const asset=await localPrivateStorage.upload({ownerUserId:producer.id,beatId:beat.id,assetType:'private_beat_deliverable',fileName:'Ready before email.mp3',mimeType:'audio/mpeg',bytes:(()=>{const frame=Buffer.alloc(417);Buffer.from([255,251,144,100]).copy(frame);return Buffer.concat([frame,frame]);})()});
  const purchase=await prisma.beatPurchase.create({data:{userId:user.id,beatId:beat.id,licenseType:'mp3',licenseTermsSnapshot:{buyer:{artistName:'Delivery Artist'}}}});
  const state=globalThis as any;
  state.beatDeliveryFixture={prisma,enabled:true,sends:0,send:async(input:any)=>{
    const current=await prisma.beatPurchase.findUniqueOrThrow({where:{id:input.purchaseId},include:{licenseAsset:true}});
    assert.ok(current.licenseUrl&&current.licenseAsset,'PDF must exist in the account before SMTP');
    const attachments=await purchaseAttachments(input.purchaseId,input.userId,input.to);
    assert.equal(attachments.length,2,'Original MP3 and agreement must be attachable');
    assert.ok(attachments.some(a=>a.content.subarray(0,4).toString()==='%PDF'));
    state.beatDeliveryFixture.sends++;
    const log=await prisma.emailLog.create({data:{userId:input.userId,toEmail:input.to,subject:'Your beat licence is ready',template:'license_ready',eventKey:`beat:${input.purchaseId}:license_ready:email`,entityType:'beat_purchase',entityId:String(input.purchaseId),provider:'smtp',status:'sent',sentAt:new Date()}});
    return {status:'sent',logId:log.id};
  }};
  await build({entryPoints:['lib/email/beat-delivery.ts'],outfile:'.cache/beat-delivery-test.cjs',bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'delivery-adapters',setup(b){
    b.onResolve({filter:/^server-only$/},a=>({path:a.path,namespace:'fixture'}));
    b.onResolve({filter:/^(?:@\/lib\/prisma|@\/lib\/email\/email-events|\.\/email-events|\.\/email-client|\.\/send-transactional-email)$/},a=>({path:a.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='server-only'?'':a.path.endsWith('prisma')?'exports.prisma=globalThis.beatDeliveryFixture.prisma':a.path.endsWith('email-events')?'exports.emailAppUrl=p=>"https://hymnmusic.fun"+p;exports.sendBeatEmailEvent=i=>globalThis.beatDeliveryFixture.send(i)':a.path.endsWith('email-client')?'exports.getEmailConfig=()=>({enabled:globalThis.beatDeliveryFixture.enabled})':'exports.retryTransactionalEmail=async()=>{throw Error("Unexpected retry")};'}));
  }}]});
  const modulePath='../.cache/beat-delivery-test.cjs';const worker=await import(modulePath);
  await assert.rejects(()=>worker.requestBeatDelivery(purchase.id,user.id,'other@example.test'),/recipient/);
  const task=await worker.requestBeatDelivery(purchase.id,user.id,user.email);
  assert.equal((await worker.requestBeatDelivery(purchase.id,user.id,user.email)).id,task.id);
  const awaken=()=>prisma.adminTask.update({where:{id:task.id},data:{status:'open',snoozedUntil:null}});
  await prisma.storedAsset.update({where:{id:asset.id},data:{deletedAt:new Date()}});
  assert.equal((await worker.deliverRequestedBeats()).pending,1);assert.equal(state.beatDeliveryFixture.sends,0);
  await prisma.storedAsset.update({where:{id:asset.id},data:{deletedAt:null}});await awaken();
  state.beatDeliveryFixture.enabled=false;assert.equal((await worker.deliverRequestedBeats()).pending,1);assert.equal(state.beatDeliveryFixture.sends,0);
  state.beatDeliveryFixture.enabled=true;await awaken();
  await Promise.all([worker.deliverRequestedBeats(),worker.deliverRequestedBeats()]);
  assert.equal(state.beatDeliveryFixture.sends,1,'Concurrent schedulers must send only once');
  assert.equal((await prisma.adminTask.findUniqueOrThrow({where:{id:task.id}})).status,'resolved');
  await awaken();await worker.deliverRequestedBeats();assert.equal(state.beatDeliveryFixture.sends,1,'A sent email must not be sent again');
  await awaken();await prisma.user.update({where:{id:user.id},data:{email:`changed-${stamp}@example.test`}});
  assert.equal((await worker.deliverRequestedBeats()).review,1,'Changed recipients must be reviewed, never silently substituted');
  assert.equal(state.beatDeliveryFixture.sends,1);
  console.log('PASS HYMN delivery gating: master/PDF/account readiness, attachments, SMTP availability, bound recipient, concurrent lease and duplicate suppression. No real email sent.');
}
main().finally(()=>prisma.$disconnect());
