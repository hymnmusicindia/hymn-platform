import { CANONICAL_HOSTINGER_PUBLIC_STORAGE_ROOT, CANONICAL_HOSTINGER_STORAGE_ROOT } from "@/lib/hostinger-storage";

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
    "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "RAZORPAY_PLAN_HALF_YEARLY",
    "RAZORPAY_PLAN_YEARLY",
    "RAZORPAY_PLAN_YEARLY_PLUS",
    "CRON_SECRET",
    "PAYOUT_ENCRYPTION_KEY"
  ];
  const issues = required.filter((name) => !process.env[name]?.trim()).map((name) => `${name} is missing.`);
  if (!(process.env.DIRENOTE_CLIENT_ID?.trim() || process.env.DISTRIBUTOR_CLIENT_ID?.trim())) issues.push("DIRENOTE_CLIENT_ID or DISTRIBUTOR_CLIENT_ID is missing.");
  if (!(process.env.DIRENOTE_API_PIN?.trim() || process.env.DISTRIBUTOR_API_PIN?.trim())) issues.push("DIRENOTE_API_PIN or DISTRIBUTOR_API_PIN is missing.");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl && !/^https:\/\//i.test(appUrl)) issues.push("NEXT_PUBLIC_APP_URL must use HTTPS in production.");
  if (process.env.GOOGLE_CLIENT_ID?.trim() && process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_ID.trim() !== process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID.trim()) issues.push("GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_CLIENT_ID must match.");
  if (process.env.ENABLE_MOCK_LOGIN === "true" || process.env.NEXT_PUBLIC_ENABLE_MOCK_LOGIN === "true") issues.push("Mock login must not be enabled in production.");
  if (process.env.VERCEL !== "1" && !(process.env.HYMN_STORAGE_ROOT?.trim() || process.env.PRIVATE_STORAGE_ROOT?.trim())) issues.push("HYMN_STORAGE_ROOT or PRIVATE_STORAGE_ROOT is missing; private asset features must remain disabled.");
  const publicStorageRoot = process.env.STORAGE_ROOT?.trim();
  const managedStorageRoot = process.env.HYMN_STORAGE_ROOT?.trim() || process.env.PRIVATE_STORAGE_ROOT?.trim();
  if (managedStorageRoot && managedStorageRoot !== CANONICAL_HOSTINGER_STORAGE_ROOT) issues.push(`HYMN_STORAGE_ROOT differs from the canonical Hostinger path ${CANONICAL_HOSTINGER_STORAGE_ROOT}. Production writes use the canonical path.`);
  if (publicStorageRoot && publicStorageRoot !== CANONICAL_HOSTINGER_PUBLIC_STORAGE_ROOT) issues.push(`STORAGE_ROOT differs from the canonical Hostinger path ${CANONICAL_HOSTINGER_PUBLIC_STORAGE_ROOT}. Production writes use the canonical path.`);
  if (publicStorageRoot && !/^(?:[A-Za-z]:[\\/]|\/)/.test(publicStorageRoot)) issues.push("STORAGE_ROOT must be an absolute persistent Hostinger path; relative upload storage can lose files between deployments.");
  if (managedStorageRoot && !/^(?:[A-Za-z]:[\\/]|\/)/.test(managedStorageRoot)) issues.push("HYMN_STORAGE_ROOT must be an absolute persistent Hostinger path.");
  for (const [name, value] of [["HYMN_STORAGE_ROOT", managedStorageRoot], ["STORAGE_ROOT", publicStorageRoot]] as const) {
    if (value && /(?:^|[\\/])(?:tmp|hbuilds|public_html)(?:[\\/]|$)/i.test(value)) issues.push(`${name} must be outside temporary and deployment directories so images survive deployments.`);
  }
  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV) issues.push("Obsolete Vercel environment flags must be removed from Hostinger to prevent storage-provider drift.");
  return issues;
}
// vercel trigger 5
// vercel trigger 10
