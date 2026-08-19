import { Prisma } from "@prisma/client";

export function inrToUsd(inr: Prisma.Decimal.Value, usdToInr: Prisma.Decimal.Value) {
  const rate = new Prisma.Decimal(usdToInr);
  if (rate.lte(0)) throw new Error("A valid USD/INR exchange rate is required.");
  return new Prisma.Decimal(inr).div(rate);
}

export function meetsUsdThreshold(inr: Prisma.Decimal.Value, usdToInr: Prisma.Decimal.Value, minimumUsd: Prisma.Decimal.Value) {
  return inrToUsd(inr, usdToInr).gte(new Prisma.Decimal(minimumUsd));
}


// vercel trigger 12
