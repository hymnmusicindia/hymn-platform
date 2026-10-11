// Keep credentials and personal payment data out of API responses and financial snapshots.
export async function gatewayRequest<T>(path: string, method: "GET" | "POST" | "PATCH" = "GET", body?: unknown): Promise<T> {
  const key = process.env.RAZORPAY_KEY_ID?.trim(); const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!key || !secret) throw new Error("Razorpay is not configured.");
  const response = await fetch(`https://api.razorpay.com/${path}`, {
    method, headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: "no-store", signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`Razorpay ${method} request failed (HTTP ${response.status}). Check product activation and account permissions.`);
  return await response.json() as T;
}
export async function gatewayPages<T>(path: string, count = 100) {
  const rows: T[] = [];
  for (let skip = 0; skip < 100000; skip += count) {
    const page = await gatewayRequest<{ items: T[] }>(`${path}${path.includes("?") ? "&" : "?"}count=${count}&skip=${skip}`);
    if (!Array.isArray(page.items)) throw new Error("Razorpay returned an invalid collection.");
    rows.push(...page.items);
    if (page.items.length < count) return rows;
  }
  throw new Error("Provider pagination limit exceeded; no partial report was published.");
}
