import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ eligible: null });

  const [beatOrder, serviceOrder, subscriptionPayment] = await Promise.all([
    prisma.checkoutOrder.findFirst({
      where: { userId: session.sub, paymentStatus: "paid", review: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, items: { select: { beat: { select: { title: true } } }, take: 3 } }
    }),
    prisma.distributionOrder.findFirst({
      where: { userId: session.sub, paymentStatus: "paid", review: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, plan: true, release: { select: { title: true } } }
    }),
    prisma.subscriptionPayment.findFirst({ where: { subscription: { userId: session.sub }, status: "captured", review: null }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, subscription: { select: { planName: true, plan: true } } } })
  ]);

  if (!beatOrder && !serviceOrder && !subscriptionPayment) return NextResponse.json({ eligible: null });
  const newestServiceDate = serviceOrder?.createdAt ?? new Date(0);
  const newestSubscriptionDate = subscriptionPayment?.createdAt ?? new Date(0);
  if (beatOrder && beatOrder.createdAt >= newestServiceDate && beatOrder.createdAt >= newestSubscriptionDate) {
    const titles = beatOrder.items.map((item) => item.beat.title);
    return NextResponse.json({ eligible: { purchaseType: "beat", purchaseId: beatOrder.id, label: titles.length > 1 ? `${titles[0]} + ${titles.length - 1} more` : titles[0] || "Beat Store purchase" } });
  }
  if (subscriptionPayment && subscriptionPayment.createdAt >= newestServiceDate) return NextResponse.json({ eligible: { purchaseType: "subscription", purchaseId: subscriptionPayment.id, label: subscriptionPayment.subscription.planName || subscriptionPayment.subscription.plan } });
  return NextResponse.json({ eligible: { purchaseType: "service", purchaseId: serviceOrder!.id, label: serviceOrder!.release?.title ? `${serviceOrder!.plan} · ${serviceOrder!.release.title}` : serviceOrder!.plan } });
}
