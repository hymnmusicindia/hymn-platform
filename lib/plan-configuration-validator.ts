/**
 * Plan Configuration Validator
 * Ensures all plan keys in distributionPlanCards have corresponding entries in lookup objects
 * Prevents "Cannot read properties of undefined" errors in components
 */

import { distributionPlanCards, type DistributionPlanOption } from "@/lib/distribution-plans";

/**
 * Get all plan keys currently defined
 */
export function getAllPlanKeys(): DistributionPlanOption[] {
  return distributionPlanCards.map((plan) => plan.key);
}

/**
 * Validate that a lookup object has entries for all plans
 * @param lookup - Object with plan keys as properties
 * @param lookupName - Name for error messages (e.g., "planPerks")
 * @returns Array of missing keys, empty if all valid
 */
export function validatePlanLookup<T extends Record<string, unknown>>(
  lookup: T,
  lookupName: string = "lookup"
): DistributionPlanOption[] {
  const definedKeys = getAllPlanKeys();
  const missingKeys: DistributionPlanOption[] = [];

  for (const key of definedKeys) {
    if (!(key in lookup)) {
      missingKeys.push(key);
      console.warn(`[${lookupName}] Missing definition for plan key: "${key}"`);
    }
  }

  return missingKeys;
}

/**
 * Audit report for plan configuration
 */
export function auditPlanConfiguration() {
  const planKeys = getAllPlanKeys();
  const report = {
    totalPlans: planKeys.length,
    planKeys,
    timestamp: new Date().toISOString(),
    issues: [] as string[]
  };

  console.group("📋 Plan Configuration Audit");
  console.log(`Total plans configured: ${report.totalPlans}`);
  console.table(planKeys);
  console.groupEnd();

  return report;
}

/**
 * Create a validated lookup object with fallback for missing keys
 * Useful when migrating between different key naming schemes
 * @param lookup - The lookup object to validate
 * @param defaultValue - Default value for missing keys
 * @param lookupName - Name for logging
 */
export function createValidatedLookup<T extends Record<string, unknown>>(
  lookup: Partial<Record<DistributionPlanOption, T>>,
  defaultValue: T,
  lookupName: string = "lookup"
): Record<DistributionPlanOption, T> {
  const allKeys = getAllPlanKeys();
  const validated: Record<string, T> = {};

  for (const key of allKeys) {
    if (key in lookup && lookup[key as DistributionPlanOption]) {
      validated[key] = lookup[key as DistributionPlanOption]!;
    } else {
      console.warn(`[${lookupName}] Using default value for key: "${key}"`);
      validated[key] = defaultValue;
    }
  }

  return validated as Record<DistributionPlanOption, T>;
}

/**
 * Type-safe plan key lookup helper
 * Use this in components instead of direct object access
 * @param key - The plan key to look up
 * @param lookup - The lookup object
 * @param fallback - Default value if key not found
 */
export function safeLookupPlanKey<T>(
  key: DistributionPlanOption | string,
  lookup: Record<string, T>,
  fallback: T
): T {
  if (typeof key !== "string") {
    console.warn(`[safeLookupPlanKey] Invalid key type: ${typeof key}`);
    return fallback;
  }

  if (key in lookup) {
    return lookup[key];
  }

  console.warn(`[safeLookupPlanKey] Missing key in lookup: "${key}"`);
  return fallback;
}

/**
 * Runtime check - call this in tests or during development
 * to catch key mismatches early
 */
export function validateAllPlanLookups() {
  const checks = {
    passed: 0,
    failed: 0,
    details: [] as Array<{
      name: string;
      status: "pass" | "fail";
      missingKeys?: DistributionPlanOption[];
    }>
  };

  // Import any lookup objects you want to validate
  // Example:
  // const planPerks = { ... };
  // const missingKeys = validatePlanLookup(planPerks, "planPerks");
  // if (missingKeys.length > 0) {
  //   checks.failed++;
  //   checks.details.push({
  //     name: "planPerks",
  //     status: "fail",
  //     missingKeys
  //   });
  // } else {
  //   checks.passed++;
  //   checks.details.push({
  //     name: "planPerks",
  //     status: "pass"
  //   });
  // }

  return checks;
}

// Export for testing
export const validator = {
  getAllPlanKeys,
  validatePlanLookup,
  auditPlanConfiguration,
  createValidatedLookup,
  safeLookupPlanKey,
  validateAllPlanLookups
};

// trigger vercel deploy
