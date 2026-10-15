import { prisma } from "@/lib/prisma";
import { INCOME_MINIMUM_INR, WALLET_SOURCES, walletIncomeBalances } from "@/lib/income-policy";
import { PAYOUT_CONFIG } from "@/lib/payout/config";
import { clearedReferralMinor } from "@/lib/referral-commissions";
export async function getIncomeSummary(userId:number) {
  const [balance,ledger,requests,commissions,referralPayouts,cleared,reviews,credit,routes]=await Promise.all([
    prisma.artistPayoutBalance.findUnique({where:{userId}}),
    prisma.walletTransaction.findMany({where:{userId,currency:"INR"},select:{type:true,amount:true,direction:true}}),
    prisma.payoutRequest.findMany({where:{userId},select:{sourceType:true,amount:true,status:true}}),
    prisma.referralCommission.groupBy({by:["status"],where:{referral:{userId}},_sum:{netMinor:true}}),
    prisma.referralCommissionPayout.findMany({where:{userId},select:{amountMinor:true,status:true}}),
    prisma.$transaction(tx=>clearedReferralMinor(tx,userId)),
    prisma.playlistReviewRequest.findMany({where:{listing:{ownerId:userId,isHymn:false},payoutStatus:{in:["HELD","PAID","FROZEN"]}},select:{amountMinor:true,payoutStatus:true,reviewedAt:true,status:true}}),
    prisma.user.findUnique({where:{id:userId},select:{referralCredits:true}}),
    prisma.routeTransfer.findMany({where:{userId,status:{not:"cancelled"}},select:{sourceKey:true,amountMinor:true,status:true}})
  ]);
  const routeAllocations=routes.map(row=>({sourceType:row.sourceKey.startsWith("studio:")?"studio":row.sourceKey.startsWith("beat:")?"producer_beat_sales":"mixed",amount:row.amountMinor/100,status:row.status==="settled"?"PAID":"REQUESTED"}));
  const allRequests=[...requests.map(row=>({...row,amount:Number(row.amount)})),...routeAllocations];
  const wallet=walletIncomeBalances(Number(balance?.lifetimeEarnings??0),Number(balance?.availableBalance??0),ledger.map(row=>({...row,amount:Number(row.amount)})),allRequests);
  const labels={artist_royalty:"Distribution royalties",studio:"Mixing & mastering gigs",producer_beat_sales:"Beat sales",other:"Other wallet income"};
  const sources=WALLET_SOURCES.map(key=>({key,label:labels[key],earned:wallet.totals[key],available:wallet.spendable[key],held:allRequests.filter(row=>row.sourceType===key&&["REQUESTED","UNDER_REVIEW","APPROVED","PROCESSING"].includes(row.status)).reduce((sum,row)=>sum+Number(row.amount),0),paid:allRequests.filter(row=>row.sourceType===key&&row.status==="PAID").reduce((sum,row)=>sum+Number(row.amount),0),minimum:key==="artist_royalty"?PAYOUT_CONFIG.minimumPayoutUsd:INCOME_MINIMUM_INR[key],currency:key==="artist_royalty"?"USD":"INR",route:"wallet"}));
  const referralPaid=referralPayouts.filter(row=>row.status==="PAID").reduce((sum,row)=>sum+row.amountMinor/100,0);
  const referralHeld=referralPayouts.filter(row=>row.status==="REQUESTED").reduce((sum,row)=>sum+row.amountMinor/100,0);
  const earned=commissions.filter(row=>row.status!=="EXCLUDED").reduce((sum,row)=>sum+(row._sum.netMinor??0)/100,0);
  const curatorAvailable=reviews.filter(row=>row.payoutStatus==="HELD"&&["NOT_A_FIT","SHORTLISTED"].includes(row.status)&&row.reviewedAt&&row.reviewedAt.getTime()<Date.now()-7*86400000).reduce((sum,row)=>sum+row.amountMinor/100,0);
  sources.push({key:"referral" as typeof sources[number]["key"],label:"Referral commissions",earned,available:Math.max(0,cleared/100-referralPaid-referralHeld),held:Math.max(0,earned-cleared/100)+referralHeld,paid:referralPaid,minimum:INCOME_MINIMUM_INR.referral,currency:"INR",route:"referral"});
  sources.push({key:"curator" as typeof sources[number]["key"],label:"Playlist curator reviews",earned:reviews.reduce((sum,row)=>sum+row.amountMinor/100,0),available:curatorAvailable,held:reviews.filter(row=>row.payoutStatus!=="PAID").reduce((sum,row)=>sum+row.amountMinor/100,0)-curatorAvailable,paid:reviews.filter(row=>row.payoutStatus==="PAID").reduce((sum,row)=>sum+row.amountMinor/100,0),minimum:INCOME_MINIMUM_INR.curator,currency:"INR",route:"curator"});
  return {sources,checkoutCredit:Number(credit?.referralCredits??0),reconciliationRequired:wallet.unresolved};
}
