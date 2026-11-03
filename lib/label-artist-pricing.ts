/** All amounts are integer paise. The discount affects extras, never the base plan. */
export const LABEL_INCLUDED_ARTISTS = 15;
export const LABEL_EXTRA_ARTIST_MINOR = 25000;
export const LABEL_MAX_EXTRA_ARTISTS = 500;
export function labelArtistQuote(extra: number) {
  if (!Number.isSafeInteger(extra) || extra < 0 || extra > LABEL_MAX_EXTRA_ARTISTS) throw Error('Choose between 0 and 500 extra artists.');
  const subtotal = extra * LABEL_EXTRA_ARTIST_MINOR;
  const discountBps = extra > 7 ? 500 : 0;
  const discount = Math.floor(subtotal * discountBps / 10000);
  return { extra, included: LABEL_INCLUDED_ARTISTS, artists: LABEL_INCLUDED_ARTISTS + extra, subtotal, discountBps, discount, addon: subtotal - discount, total: 199900 + subtotal - discount };
}
/** Only exact, server-created price variants can grant recurring slots. */
export function labelExtrasForAmount(amount: number) {
  for (let n = 0; n <= LABEL_MAX_EXTRA_ARTISTS; n++) if (labelArtistQuote(n).total === amount) return n;
  throw Error('Unrecognised Yearly+ artist price.');
}
