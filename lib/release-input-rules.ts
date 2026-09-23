/** Date-only and identifier rules shared by browser, API and provider preflight. */
export function parseReleaseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export function validIsrc(value: string) {
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(value);
}

export function validReleaseBarcode(value: string) {
  if (!/^\d{12,13}$/.test(value)) return false;
  let sum = 0;
  for (let i = value.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += Number(value[i]) * weight;
  return (10 - sum % 10) % 10 === Number(value.at(-1));
}

export function normalizeReleaseText(value: string) {
  return value.normalize("NFC").trim().replace(/[ \t]+/g, " ");
}

export function safeReleaseText(value: string) {
  // Keep intentional Unicode, accents, regional scripts, punctuation and emoji.
  return !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value) && !/<\/?[a-z][^>]*>/i.test(value);
}
