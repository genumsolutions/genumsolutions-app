import { describe, expect, it } from "vitest";
import { estimatePrint, type PrintEstimateRules } from "./printEstimate";

// Same rules the website calculator applies (lib/print.ts estimatePrint).
const rules: PrintEstimateRules = {
  minimumOrder: 350,
  designBaseCharge: 2500,
  finishingCharges: [
    { id: "sanding", name: "Sanding", amount: 200 },
    { id: "paint", name: "Painting", amount: 400 },
  ],
  bulkTiers: [
    { minQty: 5, discountPercent: 5 },
    { minQty: 20, discountPercent: 10 },
  ],
};

describe("estimatePrint", () => {
  it("uses the handoff example: 50 g PLA at NPR 12/g is NPR 600", () => {
    const estimate = estimatePrint({
      weightGrams: 50,
      quantity: 1,
      materialRatePerGram: 12,
      rules,
    });
    expect(estimate.available).toBe(true);
    expect(estimate.materialCost).toBe(600);
    expect(estimate.total).toBe(600);
  });

  it("applies the minimum order instead of a tiny figure", () => {
    const estimate = estimatePrint({
      weightGrams: 20,
      quantity: 1,
      materialRatePerGram: 12,
      rules,
    });
    expect(estimate.minimumApplied).toBe(true);
    expect(estimate.total).toBe(350);
  });

  it("adds design and finishing, then discounts the print portion only", () => {
    const estimate = estimatePrint({
      weightGrams: 100,
      quantity: 5,
      materialRatePerGram: 12,
      designRequested: true,
      finishingIds: ["sanding"],
      rules,
    });
    // 12 × 100 × 5 = 6,000 material + 1,000 finishing; design is not discounted.
    expect(estimate.materialCost).toBe(6000);
    expect(estimate.finishingCost).toBe(1000);
    expect(estimate.designCost).toBe(2500);
    expect(estimate.discountPercent).toBe(5);
    expect(estimate.discountAmount).toBe(350);
    expect(estimate.total).toBe(9150);
  });

  it("picks the highest tier the quantity reaches", () => {
    const estimate = estimatePrint({
      weightGrams: 50,
      quantity: 20,
      materialRatePerGram: 12,
      rules,
    });
    expect(estimate.discountPercent).toBe(10);
  });

  it("refuses to price an unpublished rate or a zero weight", () => {
    expect(
      estimatePrint({
        weightGrams: 0,
        quantity: 1,
        materialRatePerGram: 12,
        rules,
      }).available,
    ).toBe(false);
    const draft = estimatePrint({
      weightGrams: 100,
      quantity: 1,
      materialRatePerGram: 0,
      rules,
    });
    expect(draft.available).toBe(false);
    expect(draft.reason).toMatch(/finalised/i);
  });

  it("treats a missing quantity as one and never returns a negative total", () => {
    const estimate = estimatePrint({
      weightGrams: 50,
      quantity: Number.NaN,
      materialRatePerGram: 12,
      rules,
    });
    expect(estimate.quantity).toBe(1);
    expect(estimate.total).toBeGreaterThanOrEqual(0);
  });
});
