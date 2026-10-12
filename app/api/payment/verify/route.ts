// Keep the legacy URL on the same ownership, signature, capture and fulfilment
// path as current checkout. Never trust a browser-supplied licence/item list.
export { POST } from "@/app/api/checkout/verify-payment/route";
