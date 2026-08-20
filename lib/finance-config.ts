export const PRODUCER_COMMISSION_CONFIG = Object.freeze({
  hymnCommissionPercent: 30,
  producerSharePercent: 70
});

if (PRODUCER_COMMISSION_CONFIG.hymnCommissionPercent + PRODUCER_COMMISSION_CONFIG.producerSharePercent !== 100) {
  throw new Error("Producer commission configuration must total 100%.");
}
// vercel trigger 9
