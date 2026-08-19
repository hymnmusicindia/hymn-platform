import assert from "node:assert/strict";
import { getCurrentQuarter, getPreviousQuarter, getQuarterFromDate, getQuarterStartEnd } from "../lib/payout/quarters";
import { calculateSplitEarnings, validateSplitRecord } from "../lib/payout/split-engine";

assert.equal(getQuarterFromDate(new Date("2026-01-01T00:00:00Z")), 1);
assert.equal(getQuarterFromDate(new Date("2026-06-30T23:59:59Z")), 2);
assert.equal(getQuarterFromDate(new Date("2026-10-01T00:00:00Z")), 4);
const q2 = getQuarterStartEnd(2026, 2);
assert.equal(q2.start.toISOString(), "2026-04-01T00:00:00.000Z");
assert.equal(q2.end.toISOString(), "2026-06-30T23:59:59.999Z");
assert.deepEqual({ quarter: getCurrentQuarter(new Date("2026-07-24T00:00:00Z")).quarter, year: getCurrentQuarter(new Date("2026-07-24T00:00:00Z")).year }, { quarter: 3, year: 2026 });
assert.deepEqual({ quarter: getPreviousQuarter(new Date("2026-01-01T00:00:00Z")).quarter, year: getPreviousQuarter(new Date("2026-01-01T00:00:00Z")).year }, { quarter: 4, year: 2025 });

const split = { recipients: [
  { payoutEligible: true, inviteStatus: "accepted", sharePercent: 70 },
  { payoutEligible: true, inviteStatus: "accepted", sharePercent: 20 },
  { payoutEligible: true, inviteStatus: "accepted", sharePercent: 10 }
] };
assert.deepEqual(validateSplitRecord(split), { valid: true, total: 100, error: null });
assert.equal(validateSplitRecord({ recipients: split.recipients.slice(0, 2) }).valid, false);
const calculated = calculateSplitEarnings({ netRevenue: 10000 }, split);
assert.deepEqual(calculated.map((row) => row.amount), [7000, 2000, 1000]);
assert.equal(calculated.reduce((sum, row) => sum + row.amount, 0), 10000);

console.log("Payout domain verification passed.");
