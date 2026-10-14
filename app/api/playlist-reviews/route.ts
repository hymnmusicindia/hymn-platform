import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { consumeRateLimit } from "@/lib/rate-limit";
import { applyCuratorListing, createReviewCheckout, playlistReviewSnapshot, confirmReviewPayment, decideReview, raiseReviewConcern, updateCuratorPricing } from "@/lib/playlist-reviews";
import { verifyRazorpaySignature } from "@/lib/razorpay";
import { z } from "zod";
import { playlistTestimonials, submitPlaylistTestimonial } from "@/lib/playlist-testimonials";
import { updateReviewListeningLink, cancelScheduledPlaylistReview } from "@/lib/playlist-reviews";
import { releasePlaylistRecommendations } from "@/lib/playlist-recommendations-server";

export async function GET(request: Request) {
  const access = await requireUser(); if ("error" in access) return access.error;
  const query = new URL(request.url).searchParams;
  if (query.get('view') === 'recommendations') {
    const id = Number(query.get('releaseId'));
    if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid release.' }, { status: 400 });
    try { return NextResponse.json(await releasePlaylistRecommendations(access.user.id, id)); }
    catch { return NextResponse.json({ error: 'Recommendations unavailable.' }, { status: 404 }); }
  }
  try { return NextResponse.json(new URL(request.url).searchParams.get("view") === "testimonials" ? { testimonials: await playlistTestimonials() } : await playlistReviewSnapshot(access.user.id)); }
  catch { return NextResponse.json({ error: "The review marketplace is not ready yet. Please try again later; no payment has been taken." }, { status: 503 }); }
}
export async function POST(request: Request) {
  const access = await requireUser(); if ("error" in access) return access.error;
  if (request.headers.get("origin") !== new URL(getPublicAppUrl()).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const rate = await consumeRateLimit({ scope: "playlist-review-action", identity: String(access.user.id), limit: 30, windowSeconds: 3600 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  try {
    const body = await request.json();
    if (body.action === "cancel-scheduled") return NextResponse.json({ review: await cancelScheduledPlaylistReview(access.user.id, z.number().int().positive().parse(body.id)) });
    if (body.action === "listening-link") return NextResponse.json({ review: await updateReviewListeningLink(access.user.id, z.number().int().positive().parse(body.id), z.string().parse(body.trackUrl)) });
    if (body.action === "testimonial") return NextResponse.json(await submitPlaylistTestimonial(access.user.id, body));
    if (body.action === "apply") return NextResponse.json({ listing: await applyCuratorListing(access.user.id, body) });
    if (body.action === "pricing") return NextResponse.json({ listing: await updateCuratorPricing(access.user.id, z.number().int().positive().parse(body.id), z.number().parse(body.feeRupees), z.number().parse(body.capacity)) });
    if (body.action === "checkout") return NextResponse.json(await createReviewCheckout(access.user.id, body));
    if (body.action === "verify") {
      const payment = z.object({ orderId: z.string().min(5).max(100), paymentId: z.string().min(5).max(100), signature: z.string().min(1).max(256) }).parse(body);
      if (!verifyRazorpaySignature(payment.orderId, payment.paymentId, payment.signature)) return NextResponse.json({ error: "Invalid payment signature." }, { status: 400 });
      return NextResponse.json({ review: await confirmReviewPayment(payment.orderId, payment.paymentId, access.user.id) });
    }
    if (body.action === "decide") return NextResponse.json({ review: await decideReview(access.user.id, z.number().int().positive().parse(body.id), body) });
    if (body.action === "dispute") return NextResponse.json({ review: await raiseReviewConcern(access.user.id, z.number().int().positive().parse(body.id), z.string().parse(body.reason)) });
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Request could not be completed." }, { status: 400 }); }
}
