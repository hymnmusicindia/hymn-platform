const DEVELOPMENT_USER_SECRET = "hymn-development-user-secret-not-for-production";
const DEVELOPMENT_ADMIN_SECRET = "hymn-development-admin-secret-not-for-production";

function requiredProductionValue(name: string, value: string | undefined, developmentFallback?: string) {
  const normalized = value?.trim();
  if (normalized) return normalized;
  if (process.env.NODE_ENV !== "production" && developmentFallback) return developmentFallback;
  throw new Error(`${name} is required${process.env.NODE_ENV === "production" ? " in production" : ""}.`);
}

export function getUserSessionSecret() {
  return requiredProductionValue("JWT_SECRET", process.env.JWT_SECRET, DEVELOPMENT_USER_SECRET);
}

export function getAdminSessionSecret() {
  return requiredProductionValue("ADMIN_JWT_SECRET", process.env.ADMIN_JWT_SECRET, DEVELOPMENT_ADMIN_SECRET);
}

export function isProductionPaymentBypassEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.BYPASS_DISTRIBUTION_PAYMENT === "true";
}

export function requireRazorpayConfiguration() {
  const keyId = requiredProductionValue("RAZORPAY_KEY_ID", process.env.RAZORPAY_KEY_ID);
  const keySecret = requiredProductionValue("RAZORPAY_KEY_SECRET", process.env.RAZORPAY_KEY_SECRET);
  return { keyId, keySecret, publicKey: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || keyId };
}

export function getProductionReadinessIssues() {
  if (process.env.NODE_ENV !== "production") return [];
  const required = [
    "DATABASE_URL",
    "JWT_SECRET",
    "ADMIN_JWT_SECRET",
    "NEXT_PUBLIC_APP_URL",
    "GOOGLE_CLIENT_ID",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "DIRENOTE_CLIENT_ID",
    "DIRENOTE_API_PIN",
    "CRON_SECRET",
    "PAYOUT_ENCRYPTION_KEY"
  ];
  const issues = required.filter((name) => !process.env[name]?.trim()).map((name) => `${name} is missing.`);
  if (process.env.BYPASS_DISTRIBUTION_PAYMENT === "true") issues.push("BYPASS_DISTRIBUTION_PAYMENT must not be enabled in production.");
  if (process.env.ENABLE_MOCK_LOGIN === "true" || process.env.NEXT_PUBLIC_ENABLE_MOCK_LOGIN === "true") issues.push("Mock login must not be enabled in production.");
  if (process.env.VERCEL !== "1" && !process.env.PRIVATE_STORAGE_ROOT?.trim()) issues.push("PRIVATE_STORAGE_ROOT is missing; private asset features must remain disabled locally.");
  return issues;
}
// vercel trigger 5
// vercel trigger 10
