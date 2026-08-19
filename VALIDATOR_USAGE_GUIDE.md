/**
 * How to Use the Plan Configuration Validator
 * Quick reference guide for development and testing
 */

// ============================================================================
// EXAMPLE 1: Using the Validator in Components (Development)
// ============================================================================

// File: components/distribution-pricing-strip.tsx

import { validatePlanLookup } from "@/lib/plan-configuration-validator";
import { distributionPlanCards } from "@/lib/distribution-plans";

const planPerks = {
  one_time: [ ... ],
  half_yearly: [ ... ],
  yearly: [ ... ],
  yearly_plus: [ ... ]
};

// Development validation (remove in production)
if (process.env.NODE_ENV === "development") {
  const missingKeys = validatePlanLookup(planPerks, "planPerks");
  if (missingKeys.length > 0) {
    console.error(
      `❌ [planPerks] Missing definitions for: ${missingKeys.join(", ")}`
    );
  }
}

export function DistributionPricingStrip(...) {
  // ... rest of component
}


// ============================================================================
// EXAMPLE 2: Using in a Hook (Auto-Validation)
// ============================================================================

// File: lib/hooks/useValidatePlanConfiguration.ts

import { useEffect } from "react";
import { validatePlanLookup, getAllPlanKeys } from "@/lib/plan-configuration-validator";

export function useValidatePlanConfiguration(
  lookupObject: Record<string, unknown>,
  objectName: string = "lookup"
) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const missingKeys = validatePlanLookup(lookupObject, objectName);
    
    if (missingKeys.length > 0) {
      const allKeys = getAllPlanKeys();
      console.group(`⚠️ Configuration Issue: ${objectName}`);
      console.warn(`Missing keys: ${missingKeys.join(", ")}`);
      console.warn(`Expected keys: ${allKeys.join(", ")}`);
      console.warn("This will cause runtime errors in production!");
      console.groupEnd();
    }
  }, [lookupObject, objectName]);
}

// Usage in component:
function DistributionPricingStrip() {
  useValidatePlanConfiguration(planPerks, "planPerks");
  // ... rest of component
}


// ============================================================================
// EXAMPLE 3: Creating Safe Lookup Objects
// ============================================================================

// File: lib/hooks/useSafePlanLookup.ts

import { safeLookupPlanKey } from "@/lib/plan-configuration-validator";
import type { DistributionPlanOption } from "@/lib/distribution-plans";

export function useSafePlanLookup<T>(
  lookup: Record<string, T>,
  fallback: T
) {
  return (planKey: DistributionPlanOption | string) => {
    return safeLookupPlanKey(planKey, lookup, fallback);
  };
}

// Usage in component:
function MyComponent() {
  const getPlanPerks = useSafePlanLookup(planPerks, []);
  
  const perks = getPlanPerks(plan.key); // Always returns array, never undefined
  
  return (
    <div>
      {perks.map(perk => (...))}  // Safe - perks is always an array
    </div>
  );
}


// ============================================================================
// EXAMPLE 4: Running Validation in Tests
// ============================================================================

// File: __tests__/distribution-pricing.test.ts

import { validatePlanLookup, getAllPlanKeys } from "@/lib/plan-configuration-validator";
import { planPerks } from "@/components/distribution-pricing-strip";

describe("Distribution Pricing Component", () => {
  it("should have perks defined for all plans", () => {
    const missingKeys = validatePlanLookup(planPerks, "planPerks");
    
    expect(missingKeys).toEqual([]); // Fail test if any keys missing
  });

  it("should have consistent plan counts", () => {
    const planKeys = getAllPlanKeys();
    const perkKeys = Object.keys(planPerks);
    
    expect(perkKeys.length).toBe(planKeys.length);
  });
});


// ============================================================================
// EXAMPLE 5: Building a Safe Component Wrapper
// ============================================================================

// File: components/SafePlanCard.tsx

import { planPerks } from "./distribution-pricing-strip";
import { safeLookupPlanKey, getAllPlanKeys } from "@/lib/plan-configuration-validator";
import type { DistributionPlanCard } from "@/lib/distribution-plans";

interface SafePlanCardProps {
  plan: DistributionPlanCard;
}

export function SafePlanCard({ plan }: SafePlanCardProps) {
  // Always get perks safely with empty array fallback
  const perks = safeLookupPlanKey(
    plan.key,
    planPerks,
    [] // Fallback: empty array, component handles gracefully
  );

  return (
    <article>
      {/* ... plan info ... */}
      
      <div className="perks">
        {perks.length === 0 ? (
          <p className="text-gray-500">No features available</p>
        ) : (
          perks.map(perk => (
            <div key={perk.label} className="perk-item">
              {/* ... render perk ... */}
            </div>
          ))
        )}
      </div>
    </article>
  );
}


// ============================================================================
// EXAMPLE 6: CI/CD Integration
// ============================================================================

// File: package.json

{
  "scripts": {
    "validate:plans": "node -e \"require('./lib/plan-configuration-validator').auditPlanConfiguration()\"",
    "test:plans": "npm run test -- plan-configuration.test.ts",
    "precommit": "npm run validate:plans && npm run test:plans"
  }
}

// Run before committing:
// $ npm run validate:plans
// $ npm run test:plans


// ============================================================================
// EXAMPLE 7: Audit Report Generation
// ============================================================================

// File: scripts/audit-plans.ts

import { auditPlanConfiguration, getAllPlanKeys } from "@/lib/plan-configuration-validator";
import { distributionPlanCards } from "@/lib/distribution-plans";

async function generateAuditReport() {
  const report = auditPlanConfiguration();
  
  console.log("\n📊 PLAN CONFIGURATION AUDIT REPORT");
  console.log("=".repeat(50));
  console.log(`Generated: ${report.timestamp}`);
  console.log(`Total Plans: ${report.totalPlans}`);
  console.log(`Plan Keys: ${report.planKeys.join(", ")}`);
  
  console.log("\n📋 PLAN DETAILS:");
  distributionPlanCards.forEach(plan => {
    console.log(`
✓ ${plan.title} (${plan.key})
  - Price: Rs ${plan.price.toLocaleString("en-IN")}
  - Cadence: ${plan.cadence}
  - Artists: ${plan.artistLimit}
  - Features: ${plan.featureList.length}
  - Featured: ${plan.featured ? "Yes" : "No"}
    `);
  });
  
  if (report.issues.length > 0) {
    console.log("\n⚠️ ISSUES FOUND:");
    report.issues.forEach(issue => console.log(`  - ${issue}`));
  } else {
    console.log("\n✅ No issues found!");
  }
}

// Run with:
// $ npx ts-node scripts/audit-plans.ts


// ============================================================================
// EXAMPLE 8: Creating a Typed Configuration Builder
// ============================================================================

// File: lib/plan-builder.ts

import { getAllPlanKeys } from "./plan-configuration-validator";
import type { DistributionPlanOption } from "./distribution-plans";

interface PerkDefinition {
  label: string;
  included: boolean;
}

class PlanPerkBuilder {
  private perks: Record<string, PerkDefinition[]> = {};

  addPlan(key: DistributionPlanOption, perks: PerkDefinition[]) {
    if (this.perks[key]) {
      console.warn(`Overwriting perks for plan: ${key}`);
    }
    this.perks[key] = perks;
    return this;
  }

  build(): Record<string, PerkDefinition[]> {
    const allKeys = getAllPlanKeys();
    const missing = allKeys.filter(key => !this.perks[key]);
    
    if (missing.length > 0) {
      throw new Error(
        `Cannot build: Missing perks for plans: ${missing.join(", ")}`
      );
    }
    
    return this.perks;
  }
}

// Usage:
export const planPerks = new PlanPerkBuilder()
  .addPlan("one_time", [
    { label: "Single release", included: true },
    { label: "QC included", included: true }
  ])
  .addPlan("half_yearly", [
    { label: "Unlimited releases", included: true },
    { label: "5 artist profiles", included: true }
  ])
  .addPlan("yearly", [
    { label: "Unlimited releases", included: true },
    { label: "7 artist profiles", included: true }
  ])
  .addPlan("yearly_plus", [
    { label: "Unlimited releases", included: true },
    { label: "15 artist profiles", included: true }
  ])
  .build();


// ============================================================================
// BEST PRACTICES
// ============================================================================

/*
1. ✅ Always use defensive access:
   (planPerks[plan.key] ?? []).map(...)

2. ✅ Validate during development:
   if (process.env.NODE_ENV === "development") {
     validatePlanLookup(planPerks, "planPerks");
   }

3. ✅ Test configuration changes:
   npm run test -- plan-configuration.test.ts

4. ✅ Use type assertions:
   as "one_time" | "half_yearly" | "yearly" | "yearly_plus"

5. ✅ Provide sensible fallbacks:
   safeLookupPlanKey(key, lookup, defaultValue)

6. ❌ Avoid direct property access without fallback:
   planPerks[plan.key].map(...)  // DANGEROUS!

7. ❌ Don't add plans without updating perks:
   // Adding plan to distributionPlanCards without adding to planPerks

8. ❌ Don't mix naming conventions:
   // Plans use "yearly_plus" but perks use "premium"
*/


// ============================================================================
// QUICK START
// ============================================================================

/*
To integrate validation into your workflow:

1. Import the validator:
   import { validatePlanLookup } from "@/lib/plan-configuration-validator";

2. Add development-time check:
   if (process.env.NODE_ENV === "development") {
     const missing = validatePlanLookup(planPerks, "planPerks");
     if (missing.length > 0) console.error("Missing:", missing);
   }

3. Use defensive access:
   (planPerks[key] ?? []).map(...)

4. Run tests:
   npm run test -- plan-configuration.test.ts

5. Audit regularly:
   npm run validate:plans
*/
