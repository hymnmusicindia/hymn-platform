import { prisma } from "@/lib/prisma";
import { AdminStudioDispute } from "@/components/admin-studio-dispute";

export async function StudioFinancePanel({ publicId }: { publicId: string }) {
  const order = await prisma.studioServiceOrder.findUniqueOrThrow({ where: { publicId }, include: { payments: { include: { refunds: true } }, earning: true } });
  const money = (value: number, currency = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value);
  return <section className="my-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
    <h2 className="text-xl font-semibold">Payment &amp; refund ledger</h2>
    <p className="mt-2 text-sm text-[var(--text-muted)]">Original receipts are retained. Refunds and earning adjustments are recorded separately.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{order.payments.map(payment => <article className="rounded-xl border border-[var(--border)] p-4" key={payment.id}>
      <strong>{payment.purpose.replaceAll("_", " ")}</strong><p className="mt-1 text-sm">{payment.status} / {money(Number(payment.amount), payment.currency)}</p>
      <p className="text-sm">Refunded: {money(Number(payment.refundedAmount), payment.currency)} / Retained: {money(Number(payment.amount.sub(payment.refundedAmount)), payment.currency)}</p>
      {payment.refunds.map(refund => <p className="mt-2 break-all text-xs" key={refund.id}>{refund.status} / {money(refund.amountMinor / 100, refund.currency)} / {refund.providerRefundId || "Awaiting provider confirmation"}</p>)}
    </article>)}</div>
    {order.earning ? <p className="mt-4 text-sm">Engineer net: {money(Number(order.earning.netAmount))} / Reversed: {money(Number(order.earning.reversedNetAmount))} / Held: {money(Number(order.earning.heldNetAmount))}</p> : null}
    {["DISPUTED", "REFUND_PENDING", "REFUNDED"].includes(order.status) || order.earning ? <AdminStudioDispute orderId={publicId} settled={Boolean(order.earning)} status={order.status}/> : null}
  </section>;
}
