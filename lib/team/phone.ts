/** An international number is required; do not silently guess a country code. */
export function whatsappNumber(phone: string | null | undefined) {
  const clean = (phone || '').replace(/[\s().-]/g, '').replace(/^00/, '+');
  return /^\+?[1-9]\d{7,14}$/.test(clean) ? clean.replace(/^\+/, '') : null;
}
export function whatsappLink(phone: string | null | undefined, web = false, message?: string) {
  const number = whatsappNumber(phone);
  if (!number) return null;
  if (web) return `https://web.whatsapp.com/send?${new URLSearchParams({ phone: number, ...(message ? { text: message } : {}) })}`;
  return `https://wa.me/${number}${message ? `?${new URLSearchParams({ text: message })}` : ''}`;
}
