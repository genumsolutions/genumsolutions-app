// Same worked examples as genumsolutions-website/tests/project-pricing.test.ts.
// If these two files ever disagree, the app and the website are pricing the
// same project differently — treat that as a bug in whichever side changed.
import { describe, expect, it } from "vitest";
import {
  estimateProject,
  formatNPR,
  projectPricingAvailable,
  publishedProjectPricing,
  resolveLine,
  type ProjectPricing,
} from "./project-pricing";

const pricing = (overrides: Partial<ProjectPricing> = {}): ProjectPricing => ({
  id: "smart-dustbin-pro",
  packageBaseCharge: 0,
  componentMarkupPercent: 0,
  extras: [],
  bulkTiers: [],
  minimumOrder: 0,
  priceStatus: "approved",
  priceApprovedAt: "2026-11-13T00:00:00Z",
  priceApprovedBy: "owner",
  note: "",
  updatedAt: "2026-11-13T00:00:00Z",
  ...overrides,
});

const catalog = new Map<string, number>([
  ["esp32-board", 1000],
  ["servo", 400],
  ["sensor-kit", 1200],
]);

describe("estimateProject (website parity)", () => {
  it("prices the base charge plus each linked component", () => {
    const estimate = estimateProject({
      pricing: pricing({ packageBaseCharge: 500 }),
      links: [
        { productId: "esp32-board", quantity: 1 },
        { productId: "servo", quantity: 2 },
      ],
      catalogPrices: catalog,
    });
    expect(estimate.componentsTotal).toBe(1800);
    expect(estimate.total).toBe(2300);
  });

  it("applies the markup to catalog components only", () => {
    const estimate = estimateProject({
      pricing: pricing({ packageBaseCharge: 1000, componentMarkupPercent: 25 }),
      links: [{ productId: "esp32-board", quantity: 2 }],
      catalogPrices: catalog,
    });
    expect(estimate.componentsTotal).toBe(2500);
    expect(estimate.total).toBe(3500);
  });

  it("adds flat extras", () => {
    const estimate = estimateProject({
      pricing: pricing({
        extras: [
          { id: "training", name: "On-site training", amount: 1500 },
          { id: "delivery", name: "Delivery", amount: 300 },
        ],
      }),
      links: [{ productId: "sensor-kit", quantity: 1 }],
      catalogPrices: catalog,
    });
    expect(estimate.extrasTotal).toBe(1800);
    expect(estimate.total).toBe(3000);
  });

  it("applies the minimum order", () => {
    const estimate = estimateProject({
      pricing: pricing({ minimumOrder: 5000 }),
      links: [{ productId: "servo", quantity: 1 }],
      catalogPrices: catalog,
    });
    expect(estimate.minimumApplied).toBe(true);
    expect(estimate.total).toBe(5000);
  });

  it("uses the highest matching bulk tier on total component quantity", () => {
    const estimate = estimateProject({
      pricing: pricing({
        bulkTiers: [
          { minQty: 10, discountPercent: 5 },
          { minQty: 25, discountPercent: 12 },
        ],
      }),
      links: [
        { productId: "servo", quantity: 20 },
        { productId: "esp32-board", quantity: 5 },
      ],
      catalogPrices: catalog,
    });
    expect(estimate.discountPercent).toBe(12);
    expect(estimate.discountAmount).toBe(1560);
    expect(estimate.total).toBe(11440);
  });

  it("never publishes a draft row", () => {
    const estimate = estimateProject({
      pricing: pricing({ priceStatus: "draft", packageBaseCharge: 5000 }),
      links: [{ productId: "esp32-board", quantity: 1 }],
      catalogPrices: catalog,
    });
    expect(estimate.available).toBe(false);
    expect(estimate.total).toBe(0);
    expect(estimate.reason).toBe("Rate on request");
  });

  it("prices unknown components at zero", () => {
    const estimate = estimateProject({
      pricing: pricing({ packageBaseCharge: 800 }),
      links: [
        { productId: "missing-part", quantity: 1 },
        { productId: "free-part", quantity: 2 },
      ],
      catalogPrices: new Map([["free-part", 0]]),
    });
    expect(estimate.componentsTotal).toBe(0);
    expect(estimate.total).toBe(800);
  });

  it("ignores zero-quantity links", () => {
    const estimate = estimateProject({
      pricing: pricing(),
      links: [{ productId: "esp32-board", quantity: 0 }],
      catalogPrices: catalog,
    });
    expect(estimate.componentsTotal).toBe(0);
  });
});

describe("resolveLine", () => {
  it("marks up and multiplies by quantity", () => {
    const line = resolveLine({ productId: "x", quantity: 3 }, 1000, 10);
    expect(line.unitPrice).toBe(1100);
    expect(line.lineTotal).toBe(3300);
  });

  it("leaves the price alone with no markup", () => {
    const line = resolveLine({ productId: "x", quantity: 1 }, 500, 0);
    expect(line.lineTotal).toBe(500);
  });
});

describe("publication helpers", () => {
  it("publishes only approved rows", () => {
    expect(projectPricingAvailable(pricing())).toBe(true);
    // Components-only pricing (no base charge, no markup) is legitimate.
    expect(
      projectPricingAvailable(
        pricing({ packageBaseCharge: 0, componentMarkupPercent: 0 }),
      ),
    ).toBe(true);
    expect(projectPricingAvailable(pricing({ priceStatus: "draft" }))).toBe(
      false,
    );
  });

  it("never upgrades a draft row", () => {
    const approved = pricing({ packageBaseCharge: 900 });
    expect(publishedProjectPricing(approved)).toBe(approved);
    expect(
      publishedProjectPricing({ ...approved, priceStatus: "draft" })
        .priceStatus,
    ).toBe("draft");
  });
});

describe("formatNPR", () => {
  it("groups rupees the Nepali way", () => {
    expect(formatNPR(1234567.6)).toBe("NPR 12,34,568");
    expect(formatNPR(0)).toBe("NPR 0");
  });
});
