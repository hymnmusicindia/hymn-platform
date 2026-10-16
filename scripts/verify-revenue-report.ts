import assert from "node:assert/strict";
import { summarizeRevenue, monthlyRevenue, distributionFunding, revenueFunding, type RevenueEntry } from "../lib/revenue-report";
import { adminNavigation } from "../lib/admin-workspace-navigation";
import { consistentWorkspaceNavigation } from "../lib/workspace-navigation";
const base = { date: "2026-10-11T20:00:00Z", currency: "INR", customer: "Test", reference: "test", evidence: "gateway" as const };
const rows: RevenueEntry[] = [
  {...base,id:"s",channel:"Subscriptions",receipt:699,hymn:699,evidence:"merchant_confirmation"},
  {...base,id:"d",channel:"Distribution",receipt:99,hymn:99},
  {...base,id:"b",channel:"Beat Store",receipt:100,hymn:30},
  {...base,id:"pending",channel:"Beat Store",receipt:200,hymn:null},
  {...base,id:"studio-receipt",channel:"Studio",receipt:200,hymn:0},
  {...base,id:"studio-fee",channel:"Studio",receipt:0,hymn:20,evidence:"ledger"},
  {...base,id:"royalty-fee",channel:"Royalty fees",receipt:0,hymn:5,evidence:"ledger"},
  {...base,id:"payout-fee",channel:"Payout fees",receipt:0,hymn:10,evidence:"ledger"},
  {...base,id:"usd",channel:"Royalty fees",receipt:0,hymn:100,currency:"USD",evidence:"ledger"}
];
const result = summarizeRevenue(rows);
assert.equal(result.receipts,1298);
assert.equal(result.hymn,863);
assert.equal(result.merchantConfirmed,699);
assert.equal(result.unallocated,200);
assert.deepEqual(result.otherCurrencies,["USD"]);
assert.equal(monthlyRevenue(rows)[0].hymn,863);
assert.equal(monthlyRevenue([{...rows[0],date:"2026-09-30T20:00:00Z"}])[0].month,"2026-10","Monthly buckets use India time");
assert.equal(summarizeRevenue([]).receipts,0);
assert.equal(distributionFunding({ amount: 49, creditsUsed: 50, razorpayOrderId: "order_test" }), "hybrid");
assert.equal(distributionFunding({ amount: 0, creditsUsed: 99, razorpayOrderId: "credit_distribution_test" }), "credits");
assert.equal(distributionFunding({ amount: 0, razorpayOrderId: "subscription_legacy" }), "subscription");
assert.equal(distributionFunding({ amount: 0, razorpayOrderId: "sub_entitlement_test" }), "subscription");
assert.equal(distributionFunding({ amount: 99, creditsUsed: 0, razorpayOrderId: "order_test" }), "payment");
assert.equal(distributionFunding({ amount: 0, razorpayOrderId: "free_first_release_test" }), "free");
const mixed: RevenueEntry[] = [{...rows[0],funding:"subscription"}, {...rows[1],receipt:49,hymn:49,funding:"hybrid",creditsUsed:50}, {...rows[1],receipt:0,hymn:0,funding:"credits",creditsUsed:99}];
assert.equal(summarizeRevenue(mixed.filter(row => revenueFunding(row) === "hybrid")).receipts,49,"Hybrid cash totals exclude redeemed credits");
assert.equal(summarizeRevenue(mixed.filter(row => revenueFunding(row) === "credits")).receipts,0,"Credits do not create cash revenue");
const nav=adminNavigation(["payouts.review","system.manage"]);
assert(nav.some(row=>row.key==="revenue"&&row.group==="Command Center"&&row.label==="HYMN Revenue"));
assert(!nav.some(row=>row.key==="payments"||row.key==="health"),"Merged destinations must not duplicate menu entries");
assert(!adminNavigation(["users.read"]).some(row=>row.key==="revenue"));
const creator=consistentWorkspaceNavigation([{key:"settings",label:"Settings",group:"Account"},{key:"profile",label:"Artist Profiles",group:"Account",href:"/dashboard?tab=settings"}]);
assert(!creator.some(row=>row.group==="Account"),"Account and profile actions live in the profile menu, not the workspace rail");
assert(!creator.some(row=>row.key==="faq"||row.key==="contact"),"Support entry consolidates help destinations");
console.log("PASS revenue units, platform share, pending allocation, currency isolation, India months and consolidated navigation");
