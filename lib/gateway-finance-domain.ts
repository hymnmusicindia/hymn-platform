import { createHash } from "node:crypto";

export type ReconEntity = {
  entity_id: string; type: string; payment_id?: string; settlement_id?: string;
  currency: string; amount: number | string; credit: number; debit: number;
  fee: number; tax: number; settled: boolean; on_hold: boolean;
  created_at: number; settled_at?: number | null;
};
export function minor(value: unknown) {
  const number = typeof value === "number" || typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < 0 || number > 2147483647) throw new Error("Invalid provider amount in paise.");
  return number;
}
export function rupeesToMinor(value: { toString(): string } | number) {
  const text = value.toString();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error("Expected a non-negative rupee amount with at most two decimals.");
  const [whole, fraction = ""] = text.split(".");
  return minor(Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
}
export function unixDate(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid provider timestamp.");
  return new Date(value * 1000);
}
export function normalizeRecon(row: ReconEntity) {
  if (!row.entity_id || !row.type || !/^[A-Z]{3}$/.test(row.currency)) throw new Error("Invalid settlement report identity or currency.");
  if (typeof row.settled !== "boolean" || typeof row.on_hold !== "boolean") throw new Error("Invalid settlement report state.");
  return {
    // Settlement assignment can change from pending to settled; the transaction remains the same.
    key: createHash("sha256").update(JSON.stringify([row.entity_id, row.type])).digest("hex"),
    entityId: row.entity_id, type: row.type, paymentId: row.type === "payment" ? row.entity_id : row.payment_id || null,
    settlementId: row.settlement_id || null, currency: row.currency,
    amountMinor: minor(row.amount), creditMinor: minor(row.credit), debitMinor: minor(row.debit),
    feeMinor: minor(row.fee), taxMinor: minor(row.tax), settled: row.settled, onHold: row.on_hold,
    createdAt: unixDate(row.created_at), settledAt: row.settled_at ? unixDate(row.settled_at) : null,
  };
}
export function validateMonth(month: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Choose a month in YYYY-MM format.");
  return { year: Number(month.slice(0, 4)), month: Number(month.slice(5)), start: new Date(`${month}-01T00:00:00+05:30`), end: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1) - 19800000) };
}
// Allocate the persisted studio earning across its captured payments without inventing a commission rate.
export function allocateCreatorShare(payments: { paymentId: string; amountMinor: number }[], creatorMinor: number) {
  const total = payments.reduce((sum, row) => sum + minor(row.amountMinor), 0);
  if (!payments.length || creatorMinor <= 0 || creatorMinor > total) throw new Error("Creator allocation exceeds captured funding.");
  let allocated = 0;
  return payments.map((row, index) => {
    const amountMinor = index === payments.length - 1 ? creatorMinor - allocated : Number(BigInt(row.amountMinor) * BigInt(creatorMinor) / BigInt(total));
    allocated += amountMinor;
    return { ...row, amountMinor };
  }).filter(row => row.amountMinor > 0);
}
