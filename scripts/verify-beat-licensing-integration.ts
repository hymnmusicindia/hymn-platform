import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {PDFDocument} from 'pdf-lib';
import {prisma} from '../lib/prisma';
import {createOrder,completeCheckoutOrder,getBeatPurchasesByUser} from '../lib/db';
import {generateBeatLicense,getBeatLicenceAgreement} from '../lib/beat-license';
import {localPrivateStorage} from '../lib/private-storage';
import {purchaseAttachments} from '../lib/email/purchase-attachments';
import {beatEmail} from '../lib/email/templates/beat-email';
import {readFile} from 'node:fs/promises';

async function main(){
 assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:/,'Run only on an isolated database');
 // Exercise the deployed additive migration, including compatibility with existing rows.
 await prisma.$executeRawUnsafe('ALTER TABLE checkout_order_items DROP COLUMN license_terms_snapshot');
 await prisma.$executeRawUnsafe(await readFile('prisma/migrations/20261029150000_checkout_licence_snapshot/migration.sql','utf8'));
 const stamp=Date.now();
 const producer=await prisma.user.create({data:{name:'Licence Producer',email:`producer-${stamp}@example.test`,googleId:`p-${stamp}`,role:'PRODUCER',status:'ACTIVE'}});
 const buyer=await prisma.user.create({data:{name:'Licence Buyer',email:`buyer-${stamp}@example.test`,googleId:`b-${stamp}`,status:'ACTIVE'}});
 const outsider=await prisma.user.create({data:{name:'Other Buyer',email:`other-${stamp}@example.test`,googleId:`o-${stamp}`,status:'ACTIVE'}});
 await prisma.artistCard.create({data:{userId:buyer.id,artistName:'Stage Name'}});
 const beat=await prisma.beat.create({data:{userId:producer.id,title:'Frozen Terms',bpm:100,genre:'Hip Hop',mood:'Chill',keySignature:'C Minor',priceCents:30000,generalPriceCents:20000,mp3PriceCents:10000,exclusivePriceCents:100000,enabled:true,status:'PUBLISHED',generalStreamingLimit:25000,generalVideoLimit:2,generalTermDurationMonths:12,sampleDeclaration:'NO_UNCONTROLLED_SAMPLES'}});
 const wav=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WAVEfmt ')]);
 await localPrivateStorage.upload({ownerUserId:producer.id,beatId:beat.id,assetType:'private_beat_deliverable',fileName:'master.wav',mimeType:'audio/wav',bytes:wav});
 const order=await createOrder({userId:buyer.id,amount:200,originalPrice:200,finalAmount:200,razorpayOrderId:`licence-${stamp}`,paymentStatus:'created',items:[{beatId:beat.id,licenseType:'wav',price:200}]});
 const item=await prisma.checkoutOrderItem.findFirstOrThrow({where:{orderId:order!.id}});
 assert.equal((item.licenseTermsSnapshot as any).rights.streamingLimit,25000);
 await prisma.beat.update({where:{id:beat.id},data:{generalStreamingLimit:10,generalVideoLimit:0,title:'New catalogue title'}});
 await completeCheckoutOrder(order!.razorpayOrderId,`fixture-payment-${stamp}`);
 const purchase=await prisma.beatPurchase.findUniqueOrThrow({where:{checkoutOrderItemId:item.id}});
 assert.equal((purchase.licenseTermsSnapshot as any).rights.streamingLimit,25000,'Fulfilment must use checkout terms, not edited catalogue terms');
 await generateBeatLicense(purchase.id,buyer.id);
 const agreement=await getBeatLicenceAgreement(purchase.id,buyer.id);
 assert.equal(agreement.beatTitle,'Frozen Terms');assert.equal(agreement.artistName,'Stage Name');
 assert.equal(agreement.rights.find(r=>r.label==='Audio streams')?.value,'25000');
 assert.equal(agreement.rights.find(r=>r.label==='Music videos')?.value,'2');
 assert.ok(agreement.clauses.some(c=>c.body.includes('25000')));
 await prisma.artistCard.updateMany({where:{userId:buyer.id},data:{artistName:'Changed Stage Name'}});
 assert.deepEqual((await getBeatLicenceAgreement(purchase.id,buyer.id)).clauses,agreement.clauses);
 const attachments=await purchaseAttachments(purchase.id,buyer.id,buyer.email);
 assert.equal(attachments.length,2);assert.ok(attachments.some(a=>a.contentType==='audio/wav'));
 const pdf=attachments.find(a=>a.contentType==='application/pdf')!;
 assert.ok((await PDFDocument.load(pdf.content)).getPageCount()>=2);
 assert.equal((await purchaseAttachments(purchase.id,buyer.id,outsider.email)).length,0);
 const email=beatEmail({event:'license_ready',userName:buyer.name,beatTitle:beat.title,url:'https://hymnmusic.fun/licenses/'+purchase.id,purchaseId:purchase.id});
 assert.ok(email.html.includes(`/api/beat-purchases/${purchase.id}/download`));assert.ok(email.text.includes(`/licenses/${purchase.id}`));
 const listed=(await getBeatPurchasesByUser(buyer.id)).find(p=>p.id===purchase.id)!;
 assert.equal(listed.downloadUrl,`/api/beat-purchases/${purchase.id}/download`);
 const state=globalThis as any;state.licensingPrisma=prisma;state.licensingActor={id:buyer.id,role:'customer'};
 for(const kind of ['download','license']){
   await build({entryPoints:[`app/api/beat-purchases/[id]/${kind}/route.ts`],outfile:`.cache/licensing-${kind}.cjs`,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'auth',setup(b){b.onResolve({filter:/^@\/lib\/(access|prisma)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.endsWith('access')?'exports.requireUser=async()=>({user:globalThis.licensingActor})':'exports.prisma=globalThis.licensingPrisma'}));}}]});
   const route=await import(`../.cache/licensing-${kind}.cjs`);
   const invoke=(id:string)=>route.GET(new Request(`https://hymnmusic.fun/api/beat-purchases/${id}/${kind}`),{params:Promise.resolve({id})});
   assert.equal((await invoke('bad')).status,404);
   const success=await invoke(String(purchase.id));assert.equal(success.status,200);assert.match(success.headers.get('content-disposition')||'',/attachment/);assert.equal(success.headers.get('cache-control'),'private, no-store');
   state.licensingActor={id:outsider.id,role:'customer'};assert.equal((await invoke(String(purchase.id))).status,404);
   state.licensingActor={id:buyer.id,role:'customer'};
   await prisma.beatPurchase.update({where:{id:purchase.id},data:{hasAccess:false}});assert.equal((await invoke(String(purchase.id))).status,403);
   await prisma.beatPurchase.update({where:{id:purchase.id},data:{hasAccess:true}});
 }
 console.log('PASS actual migration, checkout-to-issued term snapshots, file/PDF delivery, account purchases, email links/attachments, ownership and revoked access. No live payments or email.');
}
main().finally(()=>prisma.$disconnect());
