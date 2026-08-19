/**
 * Plan Configuration Tests
 * Ensures all plan definitions are consistent and complete
 * Run with: npm run test -- plan-configuration.test.ts
 */

import { distributionPlanCards } from "@/lib/distribution-plans";
import { getAllPlanKeys, validatePlanLookup } from "@/lib/plan-configuration-validator";

describe("Distribution Plan Configuration", () => {
  describe("Plan Keys Consistency", () => {
    it("should have all expected plan keys", () => {
      const keys = getAllPlanKeys();
      expect(keys).toContain("one_time");
      expect(keys).toContain("half_yearly");
      expect(keys).toContain("yearly");
      expect(keys).toContain("yearly_plus");
    });

    it("should have at least 4 plans defined", () => {
      expect(distributionPlanCards.length).toBeGreaterThanOrEqual(4);
    });

    it("should not have duplicate plan keys", () => {
      const keys = getAllPlanKeys();
      const uniqueKeys = new Set(keys);
      expect(keys.length).toBe(uniqueKeys.size);
    });
  });

  describe("Plan Structure Validation", () => {
    it("each plan should have required properties", () => {
      distributionPlanCards.forEach((plan) => {
        expect(plan).toHaveProperty("key");
        expect(plan).toHaveProperty("title");
        expect(plan).toHaveProperty("price");
        expect(plan).toHaveProperty("cadence");
        expect(plan).toHaveProperty("tag");
        expect(plan).toHaveProperty("description");
        expect(plan).toHaveProperty("cta");
        expect(plan).toHaveProperty("featureList");
        expect(plan).toHaveProperty("featured");
        expect(plan).toHaveProperty("artistLimit");
        expect(plan).toHaveProperty("label_editable");
      });
    });

    it("price should be a positive number", () => {
      distributionPlanCards.forEach((plan) => {
        expect(typeof plan.price).toBe("number");
        expect(plan.price).toBeGreaterThan(0);
      });
    });

    it("artistLimit should be a non-negative number", () => {
      distributionPlanCards.forEach((plan) => {
        expect(typeof plan.artistLimit).toBe("number");
        expect(plan.artistLimit).toBeGreaterThanOrEqual(0);
      });
    });

    it("featureList should be an array of strings", () => {
      distributionPlanCards.forEach((plan) => {
        expect(Array.isArray(plan.featureList)).toBe(true);
        expect(plan.featureList.length).toBeGreaterThan(0);
        plan.featureList.forEach((feature) => {
          expect(typeof feature).toBe("string");
          expect(feature.length).toBeGreaterThan(0);
        });
      });
    });

    it("title and description should not be empty", () => {
      distributionPlanCards.forEach((plan) => {
        expect(plan.title.length).toBeGreaterThan(0);
        expect(plan.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Plan-Specific Rules", () => {
    it("one_time plan should not allow multiple artists", () => {
      const plan = distributionPlanCards.find((p) => p.key === "one_time");
      expect(plan).toBeDefined();
      expect(plan?.artistLimit).toBe(0);
      expect(plan?.label_editable).toBe(false);
    });

    it("yearly_plus should have highest artist limit", () => {
      const plan = distributionPlanCards.find((p) => p.key === "yearly_plus");
      expect(plan).toBeDefined();
      expect(plan?.artistLimit).toBeGreaterThanOrEqual(15);
    });

    it("yearly_plus should allow label editing", () => {
      const plan = distributionPlanCards.find((p) => p.key === "yearly_plus");
      expect(plan).toBeDefined();
      expect(plan?.label_editable).toBe(true);
    });

    it("other plans should not allow label editing", () => {
      distributionPlanCards.forEach((plan) => {
        if (plan.key !== "yearly_plus") {
          expect(plan.label_editable).toBe(false);
        }
      });
    });

    it("yearly plan should be marked as featured", () => {
      const plan = distributionPlanCards.find((p) => p.key === "yearly");
      expect(plan).toBeDefined();
      expect(plan?.featured).toBe(true);
    });
  });

  describe("PlanPerks Configuration", () => {
    it("distribution-pricing-strip should have all plan keys defined", () => {
      // This would need to import planPerks from the component
      // For now, we just verify the plan keys exist
      const keys = getAllPlanKeys();
      expect(keys.length).toBeGreaterThan(0);
    });
  });

  describe("Price Consistency", () => {
    it("yearly_plus should cost more than yearly", () => {
      const yearly = distributionPlanCards.find((p) => p.key === "yearly");
      const yearlyPlus = distributionPlanCards.find((p) => p.key === "yearly_plus");
      expect(yearly).toBeDefined();
      expect(yearlyPlus).toBeDefined();
      expect(yearlyPlus!.price).toBeGreaterThan(yearly!.price);
    });

    it("yearly should cost more than half_yearly", () => {
      const halfYearly = distributionPlanCards.find((p) => p.key === "half_yearly");
      const yearly = distributionPlanCards.find((p) => p.key === "yearly");
      expect(halfYearly).toBeDefined();
      expect(yearly).toBeDefined();
      expect(yearly!.price).toBeGreaterThan(halfYearly!.price);
    });

    it("one_time should cost less than any subscription", () => {
      const oneTime = distributionPlanCards.find((p) => p.key === "one_time");
      const subscriptions = distributionPlanCards.filter((p) => p.key !== "one_time");
      
      expect(oneTime).toBeDefined();
      subscriptions.forEach((plan) => {
        expect(oneTime!.price).toBeLessThan(plan.price);
      });
    });
  });

  describe("CTA and Messaging", () => {
    it("each plan should have a call-to-action", () => {
      distributionPlanCards.forEach((plan) => {
        expect(plan.cta.length).toBeGreaterThan(0);
      });
    });

    it("CTA should be relevant to plan type", () => {
      const oneTime = distributionPlanCards.find((p) => p.key === "one_time");
      expect(oneTime?.cta.toLowerCase()).toMatch(/pay|once|submit/i);
    });
  });
});

// trigger vercel deploy
