import 'server-only';
import {randomUUID} from 'node:crypto';
import {prisma} from './prisma';
import {razorpay} from './razorpay';
import {object} from './distribution-services-contract';
import {getSubscriptionStatus} from './subscription-helpers';
import {OAC_ACCESS_PLAN, oacAccessPrice} from './youtube-oac-contract';
import {oacArtistLiveSongCount} from './oac-artist-releases';

export async function oacAccessState(userId:number, artistId:number) {
  const [subscription, order, pending] = await Promise.all([getSubscriptionStatus(userId), prisma.distributionOrder.findFirst({where:{userId,plan:OAC_ACCESS_PLAN,paymentStatus:'paid',fulfilledAt:{not:null},quoteSnapshot:{path:['artistId'],equals:artistId}},orderBy:{id:'asc'}}), prisma.distributionOrder.findFirst({where:{userId,plan:OAC_ACCESS_PLAN,paymentStatus:'created',quoteSnapshot:{path:['artistId'],equals:artistId}},orderBy:{id:'desc'},select:{amount:true}})]);
  return {pricingTier:subscription.hasActiveSubscription?subscription.plan:null,owned:Boolean(order), pendingCheckout:Boolean(pending), amount:pending?.amount ?? oacAccessPrice(subscription.plan,subscription.hasActiveSubscription), orderId:order?.id || null};
}
export async function requireOacAccess(userId:number,artistId:number) {
  // Applications accepted before paid access launched retain their existing entitlement.
  const previous = await prisma.releaseChangeRequest.count({where:{requestedByUserId:userId,requestType:'distribution_service',requestedChanges:{path:['resource'],equals:`artist:${artistId}`}}});
  if(!previous && !(await oacAccessState(userId,artistId)).owned) throw Error('Obtain YouTube OAC access for this artist before submitting.');
}
export async function purchaseOacAccess(userId:number,artistId:number) {
  await prisma.artistCard.findFirstOrThrow({where:{id:artistId,userId,archivedAt:null,user:{status:'ACTIVE'}}});
  const quote = await oacAccessState(userId,artistId);
  if(quote.owned)return {requiresPayment:false};
  const order = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`oac-access:${userId}:${artistId}`},7211))`;
    const existing = await tx.distributionOrder.findFirst({where:{userId,plan:OAC_ACCESS_PLAN,paymentStatus:{in:['created','paid']},quoteSnapshot:{path:['artistId'],equals:artistId}},orderBy:{id:'desc'}});
    if(existing) return existing;
    if(!quote.amount) return tx.distributionOrder.create({data:{userId,plan:OAC_ACCESS_PLAN,amount:0,currency:'INR',razorpayOrderId:`oac_included_${randomUUID()}`,paymentStatus:'paid',fulfilledAt:new Date(),quoteSnapshot:{artistId,amount:0,kind:'yearly_plus_included',pricingTier:quote.pricingTier}}});
    if(!razorpay || !process.env.RAZORPAY_KEY_ID) throw Error('Payments are temporarily unavailable. No charge was made.');
    const provider = await razorpay.orders.create({amount:quote.amount*100,currency:'INR',receipt:`oac-access-${randomUUID().slice(0,20)}`,notes:{purpose:OAC_ACCESS_PLAN,userId:String(userId),artistId:String(artistId)}});
    return tx.distributionOrder.create({data:{userId,plan:OAC_ACCESS_PLAN,amount:quote.amount,currency:'INR',razorpayOrderId:provider.id,quoteSnapshot:{artistId,amount:quote.amount,kind:'artist_access',pricingTier:quote.pricingTier}}});
  }, {timeout:20000});
  if(order.paymentStatus==='paid') { if(order.amount>0&&!order.fulfilledAt)await fulfillOacAccess(order.razorpayOrderId); await notifyOacEligibility(userId,artistId); return {requiresPayment:false}; }
  return {requiresPayment:true,orderId:order.razorpayOrderId,amount:order.amount*100,currency:order.currency,key:process.env.RAZORPAY_KEY_ID};
}
export async function fulfillOacAccess(orderId:string) {
  const order = await prisma.distributionOrder.findUniqueOrThrow({where:{razorpayOrderId:orderId}});
  const artistId=Number(object(order.quoteSnapshot).artistId);
  if(order.plan!==OAC_ACCESS_PLAN || order.paymentStatus!=='paid' || !order.razorpayPaymentId || ![150,200].includes(order.amount) || order.currency!=='INR' || !Number.isSafeInteger(artistId)) throw Error('OAC access payment is not verified.');
  await prisma.artistCard.findFirstOrThrow({where:{id:artistId,userId:order.userId}});
  await prisma.distributionOrder.updateMany({where:{id:order.id,paymentStatus:'paid',fulfilledAt:null},data:{fulfilledAt:new Date()}});
  await notifyOacEligibility(order.userId,artistId);
}
export async function notifyOacEligibility(userId:number,artistId:number) {
  const eventKey=`oac-access:${userId}:${artistId}:eligible`;
  if(await prisma.notification.count({where:{eventKey}}))return;
  if(!(await oacAccessState(userId,artistId)).owned || await oacArtistLiveSongCount(userId,artistId)<5) return;
  const artist=await prisma.artistCard.findFirst({where:{id:artistId,userId,archivedAt:null},select:{artistName:true,direNoteArtistId:true}});
  if(!artist || !/^[1-9]\d*$/.test(artist.direNoteArtistId || '') || !Number.isSafeInteger(Number(artist.direNoteArtistId)))return;
  if(await prisma.releaseChangeRequest.count({where:{requestedByUserId:userId,requestType:'distribution_service',requestedChanges:{path:['resource'],equals:`artist:${artistId}`}}}))return;
  await prisma.notification.createMany({skipDuplicates:true,data:{userId,eventKey,type:'oac_eligible',title:`${artist.artistName} is ready for YouTube OAC`,body:'Your artist has five live songs distributed by HYMN. Your OAC access is already paid for or included in your plan. You can submit your application now.',href:`/promotion/youtube-oac?artistId=${artistId}`,actionLabel:'Submit application',metadata:{artistId}}});
}
export async function refreshOacEligibility(userId?:number) {
  let cursor=0;
  do {
    const orders=await prisma.distributionOrder.findMany({where:{id:{gt:cursor},plan:OAC_ACCESS_PLAN,paymentStatus:'paid',fulfilledAt:{not:null},...(userId?{userId}:{})},select:{id:true,userId:true,quoteSnapshot:true},orderBy:{id:'asc'},take:100});
    for(const order of orders){const artistId=Number(object(order.quoteSnapshot).artistId);if(Number.isSafeInteger(artistId))await notifyOacEligibility(order.userId,artistId);}
    if(orders.length<100)return;
    cursor=orders.at(-1)!.id;
  } while(true);
}
