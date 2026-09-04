import { findCouponByCode, findUserById, getCouponUsage, listBeats } from "@/lib/db";
import { distributionPlanCards } from "@/lib/distribution-plans";
import { getTrackPricingQuote, getUgcAddonPrice } from "@/lib/distribution-pricing";
import { beatLicenseLabel, beatLicensePrice, normalizeBeatLicenseType } from "@/lib/beat-store";
import type { LicenseType, User } from "@/lib/types";
import type { z } from "zod";
import type { checkoutQuoteSchema } from "@/lib/validation";

export const REFERRAL_REWARD_AMOUNT = 5;
export const REFERRAL_FRIEND_DISCOUNT = 3;
export const REFERRAL_CAMPAIGN_ENDS_AT = "";

export type CheckoutInput = z.infer<typeof checkoutQuoteSchema>;

export type CheckoutLineItem = {
  productId: string;
  label: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  beatId?: number;
  licenseType?: LicenseType;
};

export type CheckoutQuote = {
  productId: string;
  lineItems: CheckoutLineItem[];
  originalPrice: number;
  couponCode: string | null;
  couponDiscount: number;
  referralCreditsApplied: number;
  finalAmount: number;
  referralCreditBalance: number;
  referralBenefitApplied: number;
  messages: string[];
};

function roundMoney(value: number) {
  return Math.max(0, Math.round(value * 100) / 100);
}

function normalizeCoupon(code?: string | null) {
  return code?.trim().toUpperCase() || null;
}

async function buildLineItems(input: CheckoutInput): Promise<CheckoutLineItem[]> {
  const beats = await listBeats();

  return input.items.map((item) => {
    if (item.type === "beat") {
      const beat = beats.find((entry) => entry.id === item.beatId);
      if (!beat || !beat.enabled) throw new Error("One of the selected beats is unavailable.");
      const licenseType = normalizeBeatLicenseType(item.licenseType);
      const reservationActive = beat.status === "EXCLUSIVE_RESERVED" && (!beat.exclusiveReservationExpiresAt || new Date(beat.exclusiveReservationExpiresAt).getTime() > Date.now());
      if (!beat.enabled || (!["PUBLISHED", "EXCLUSIVE_RESERVED"].includes(String(beat.status))) || (licenseType !== "exclusive" && reservationActive)) throw new Error("This beat is not available for licensing.");
      const unitPrice = beatLicensePrice(beat, licenseType);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error("This licence is not available.");
      return {
        productId: `beat:${beat.id}:${licenseType}`,
        label: beat.title,
        description: licenseType === "exclusive" ? "Stems + WAV exclusive rights with Content ID" : `${beatLicenseLabel(licenseType)}. General commercial licence with no Content ID.`,
        quantity: 1,
        unitPrice,
        total: unitPrice,
        beatId: beat.id,
        licenseType
      };
    }

    const plan = distributionPlanCards.find((entry) => entry.key === item.plan);
    if (!plan) throw new Error("Invalid distribution plan selected.");
    const basePrice = item.plan === "one_time"
      ? getTrackPricingQuote(item.trackCount).finalPrice + getUgcAddonPrice(item.platforms, item.plan, { youtubeContentIdEnabled: item.youtubeContentIdEnabled })
      : plan.price;

    return {
      productId: `distribution:${item.plan}`,
      label: plan.title,
      description: item.plan === "one_time" ? `${item.trackCount} track release submission` : `${plan.cadence} distribution subscription`,
      quantity: 1,
      unitPrice: basePrice,
      total: basePrice
    };
  });
}

export async function buildCheckoutQuote(userId: number, input: CheckoutInput): Promise<CheckoutQuote> {
  const user = await findUserById(userId);
  if (!user) throw new Error("User not found.");

  const lineItems = await buildLineItems(input);
  const originalPrice = roundMoney(lineItems.reduce((sum, item) => sum + item.total, 0));
  const messages: string[] = [];

  let couponDiscount = 0;
  const couponCode = normalizeCoupon(input.couponCode);
  if (couponCode) {
    const coupon = await findCouponByCode(couponCode);
    if (!coupon) throw new Error("Coupon code is invalid.");
    if (coupon.expiryDate && new Date(coupon.expiryDate).getTime() < Date.now()) {
      throw new Error("Coupon code has expired.");
    }

    const usage = await getCouponUsage(coupon.code, userId);
    if (coupon.usageLimit != null && usage.total >= coupon.usageLimit) {
      throw new Error("Coupon usage limit has been reached.");
    }
    if (usage.byUser >= coupon.perUserLimit) {
      throw new Error("You have already used this coupon.");
    }

    couponDiscount = coupon.discountType === "percentage"
      ? roundMoney(originalPrice * (coupon.discountValue / 100))
      : roundMoney(coupon.discountValue);
    couponDiscount = Math.min(couponDiscount, originalPrice);
    messages.push(`Coupon ${coupon.code} applied.`);
  }

  const afterCoupon = roundMoney(originalPrice - couponDiscount);
  const referralCreditBalance = roundMoney(Number(user.referralCredits ?? 0));
  const referralCreditsApplied = input.useReferralCredits ? Math.min(referralCreditBalance, afterCoupon) : 0;
  const referralBenefitApplied = 0;
  const finalAmount = roundMoney(afterCoupon - referralCreditsApplied - referralBenefitApplied);

  if (referralCreditsApplied > 0) messages.push(`HYMN checkout credits worth Rs ${referralCreditsApplied.toLocaleString("en-IN")} applied.`);

  return {
    productId: lineItems.length === 1 ? lineItems[0].productId : "bundle",
    lineItems,
    originalPrice,
    couponCode,
    couponDiscount,
    referralCreditsApplied,
    finalAmount,
    referralCreditBalance,
    referralBenefitApplied,
    messages
  };
}

export function quoteToOrderItems(quote: CheckoutQuote) {
  return quote.lineItems
    .filter((item) => item.beatId && item.licenseType)
    .map((item) => ({
      beatId: item.beatId as number,
      licenseType: normalizeBeatLicenseType(item.licenseType),
      price: item.total
    }));
}

export function buildReferralLink(user: User, origin: string) {
  return `${origin.replace(/\/$/, "")}/join?ref=${encodeURIComponent(user.referralCode)}`;
}
