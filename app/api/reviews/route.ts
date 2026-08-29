import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const rate = await consumeRateLimit({ scope: "purchase-review", identity: String(session.sub), limit: 12, windowSeconds: 60 * 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many review attempts." }, { status: 429 });

  const body = await request.json().catch(() => null);
  const purchaseType = ["beat", "service", "subscription"].includes(body?.purchaseType) ? body.purchaseType as "beat" | "service" | "subscription" : null;
  const purchaseId = Number(body?.purchaseId);
  const rating = Number(body?.rating);
  if (!purchaseType || !Number.isInteger(purchaseId) || purchaseId < 1 || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "A valid purchase and rating from 1 to 5 are required." }, { status: 400 });
  }

  try {
    if (purchaseType === "beat") {
      const order = await prisma.checkoutOrder.findFirst({ where: { id: purchaseId, userId: session.sub, paymentStatus: "paid" }, select: { id: true, items: { select: { beat: { select: { title: true } } }, take: 3 } } });
      if (!order) return NextResponse.json({ error: "Verified purchase not found." }, { status: 404 });
      const titles = order.items.map((item) => item.beat.title);
      const review = await prisma.purchaseReview.create({ data: { userId: session.sub, checkoutOrderId: order.id, purchaseType, purchaseLabel: titles.length > 1 ? `${titles[0]} + ${titles.length - 1} more` : titles[0] || "Beat Store purchase", rating }, select: { id: true } });
      return NextResponse.json({ review }, { status: 201 });
    }

    if (purchaseType === "subscription") {
      const payment = await prisma.subscriptionPayment.findFirst({ where: { id: purchaseId, status: "captured", subscription: { userId: session.sub } }, select: { id: true, subscription: { select: { planName: true, plan: true } } } });
      if (!payment) return NextResponse.json({ error: "Verified purchase not found." }, { status: 404 });
      const review = await prisma.purchaseReview.create({ data: { userId: session.sub, subscriptionPaymentId: payment.id, purchaseType, purchaseLabel: payment.subscription.planName || payment.subscription.plan, rating }, select: { id: true } });
      return NextResponse.json({ review }, { status: 201 });
    }
    const order = await prisma.distributionOrder.findFirst({ where: { id: purchaseId, userId: session.sub, paymentStatus: "paid" }, select: { id: true, plan: true, release: { select: { title: true } } } });
    if (!order) return NextResponse.json({ error: "Verified purchase not found." }, { status: 404 });
    const review = await prisma.purchaseReview.create({ data: { userId: session.sub, distributionOrderId: order.id, purchaseType, purchaseLabel: order.release?.title ? `${order.plan} · ${order.release.title}` : order.plan, rating }, select: { id: true } });
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    return NextResponse.json({ error: duplicate ? "This purchase has already been reviewed." : "Review could not be saved." }, { status: duplicate ? 409 : 500 });
  }
}
