import assert from "node:assert/strict";
import { buildCheckoutQuote, type CheckoutInput } from "../lib/checkout";

async function main() {
  const beat = { type: "beat", beatId: 1, licenseType: "mp3" } as const;
  const subscription = { type: "distribution", plan: "yearly", trackCount: 1, platforms: ["Spotify"] } as const;
  const reject = (input: unknown, message: RegExp) => assert.rejects(buildCheckoutQuote(1, input as CheckoutInput), message);
  await reject({ items: [{ ...subscription, plan: "one_time" }] }, /distribution form/);
  await reject({ items: [beat, subscription] }, /separately/);
  await reject({ items: [subscription], couponCode: "DISCOUNT" }, /recurring subscriptions/);
  await reject({ items: [subscription], useReferralCredits: true }, /recurring subscriptions/);
  await reject({ items: [beat, { ...beat, licenseType: "wav" }] }, /one licence per beat/);
  console.log("Checkout rejects unbound release payments, mixed subscription carts, unsupported recurring discounts, and duplicate beat licences before creating orders.");
}
void main();
