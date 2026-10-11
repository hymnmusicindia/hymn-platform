import assert from "node:assert/strict";
import { summarizeRevenue, monthlyRevenue, type RevenueEntry } from "../lib/revenue-report";
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
const nav=adminNavigation(["payouts.review","system.manage"]);
assert(nav.some(row=>row.key==="revenue"&&row.group==="Command Center"&&row.label==="HYMN Revenue"));
assert(!nav.some(row=>row.key==="payments"||row.key==="health"),"Merged destinations must not duplicate menu entries");
assert(!adminNavigation(["users.read"]).some(row=>row.key==="revenue"));
const creator=consistentWorkspaceNavigation([{key:"settings",label:"Settings",group:"Account"},{key:"profile",label:"Artist Profiles",group:"Account",href:"/dashboard?tab=settings"}]);
assert.equal(creator.filter(row=>row.href==="/dashboard?tab=settings").length,1,"Settings and profiles share one destination");
assert(!creator.some(row=>row.key==="faq"||row.key==="contact"),"Support entry consolidates help destinations");
console.log("PASS revenue units, platform share, pending allocation, currency isolation, India months and consolidated navigation");
