import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeReferralCode, REFERRAL_ATTRIBUTION_COOKIE, REFERRAL_ATTRIBUTION_MAX_AGE_SECONDS } from "@/lib/referrals";

export async function GET(request: NextRequest) {
  const code = normalizeReferralCode(request.nextUrl.searchParams.get("ref"));
  const destination = new URL("/login", request.url);
  destination.searchParams.set("mode", "signup");
  if (!code) {
    destination.searchParams.set("referralError", "invalid");
    return NextResponse.redirect(destination);
  }
  const referrer = await prisma.user.findFirst({ where: { referralCode: { equals: code, mode: "insensitive" }, status: "ACTIVE" }, select: { id: true, referralCode: true } });
  if (!referrer?.referralCode) {
    destination.searchParams.set("referralError", "invalid");
    return NextResponse.redirect(destination);
  }
  const normalized = normalizeReferralCode(referrer.referralCode);
  const visitorIdentity = `${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous"}:${request.headers.get("user-agent") || "unknown"}`;
  const visitorHash = createHash("sha256").update(`${visitorIdentity}:${process.env.SESSION_SECRET || "hymn-referral"}`).digest("hex");
  await prisma.referralVisit.create({ data: { referrerId: referrer.id, referralCode: normalized, visitorHash } });
  destination.searchParams.set("ref", normalized);
  const response = NextResponse.redirect(destination);
  response.cookies.set(REFERRAL_ATTRIBUTION_COOKIE, normalized, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: REFERRAL_ATTRIBUTION_MAX_AGE_SECONDS });
  return response;
}
