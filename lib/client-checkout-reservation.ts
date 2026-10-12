export async function cancelUnpaidCheckout(orderId: string) {
  try {
    const response = await fetch("/api/checkout/release-reservation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }), keepalive: true });
    return response.ok;
  } catch {
    // An unreachable server must leave the hold to expire, never unlock locally.
    return false;
  }
}
