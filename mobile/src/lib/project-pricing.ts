// =====================================================================
// project-pricing — the app's copy of the website's project price maths.
//
// The website prices a project package from four sources, all managed in
// Admin → Projects → Pricing:
//   1. a package base charge
//   2. its linked catalog components (project_components join, qty-aware),
//      each marked up by component_markup_percent
//   3. optional flat extras (training, delivery, …)
//   4. bulk tiers (total component quantity → % off) and a minimum order
//
// The app must produce the SAME number as the website for the same inputs, so
// this is a direct port of genumsolutions-website/lib/project-pricing.ts.
// Keep the two in step: if a rule changes there, change it here too — the
// website's tests/project-pricing.test.ts and this file's test pin the same
// worked examples.
//
// Nothing here hardcodes a price. Every figure arrives from the published
// project_pricing row (approved-only via RLS) + the catalog products.
// =====================================================================

/** One optional extra a buyer can add to a project quote (training, assembly, …). */
export type ProjectPricingExtra = {
  id: string;
  name: string;
  /** NPR, flat add-on. */
  amount: number;
};

/** Total component quantity → % off the subtotal (parallel to print bulk tiers). */
export type ProjectPricingBulkTier = {
  minQty: number;
  discountPercent: number;
};

/** One project package's pricing rules (one row in public.project_pricing). */
export type ProjectPricing = {
  /** = the project product id */
  id: string;
  packageBaseCharge: number;
  componentMarkupPercent: number;
  extras: ProjectPricingExtra[];
  bulkTiers: ProjectPricingBulkTier[];
  minimumOrder: number;
  priceStatus: "draft" | "approved";
  priceApprovedAt: string | null;
  priceApprovedBy: string;
  note: string;
  updatedAt: string;
};

/** Linked component + the quantity the project needs (from project_components). */
export type ProjectComponentLink = { productId: string; quantity: number };

/** A linked component resolved to a catalog price + the priced line. */
export type ProjectPricingLine = {
  productId: string;
  name: string;
  catalogPrice: number;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type ProjectPricingEstimateInput = {
  pricing: ProjectPricing;
  links: ProjectComponentLink[];
  /** Catalog prices for the linked component ids (from the products table). */
  catalogPrices: Map<string, number>;
};

/** A project price estimate (customer-facing). */
export type ProjectPricingEstimate = {
  available: boolean;
  packageBaseCharge: number;
  componentsTotal: number;
  extrasTotal: number;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  beforeMinimum: number;
  total: number;
  minimumApplied: boolean;
  minimumOrder: number;
  reason: string;
};

/** Default pricing row: nothing set, draft ("rate on request"). */
export const defaultProjectPricing: ProjectPricing = {
  id: "",
  packageBaseCharge: 0,
  componentMarkupPercent: 0,
  extras: [],
  bulkTiers: [],
  minimumOrder: 0,
  priceStatus: "draft",
  priceApprovedAt: null,
  priceApprovedBy: "",
  note: "",
  updatedAt: new Date(0).toISOString(),
};

/** Customer-facing view: prices only exist once an admin approved the row. */
export function publishedProjectPricing(
  pricing: ProjectPricing,
): ProjectPricing {
  if (pricing.priceStatus === "approved") return pricing;
  return { ...pricing, priceStatus: "draft" as const };
}

/**
 * Whether a published pricing row may be shown to customers at all.
 *
 * Approval is the only gate — a package can be priced purely from its catalog
 * components (no base charge, no markup). Callers check the estimate's total
 * to tell "priced" from "not priced yet". Mirrors the website helper.
 */
export function projectPricingAvailable(pricing: ProjectPricing): boolean {
  return pricing.priceStatus === "approved";
}

/** unit price = catalog price × (1 + markup%); line = unit × quantity. */
export function resolveLine(
  link: ProjectComponentLink,
  catalogPrice: number,
  markupPercent: number,
): ProjectPricingLine {
  const unitPrice = catalogPrice * (1 + markupPercent / 100);
  return {
    productId: link.productId,
    name: "",
    catalogPrice,
    unitPrice: Math.round(unitPrice * 100) / 100,
    quantity: link.quantity,
    lineTotal: Math.round(link.quantity * unitPrice * 100) / 100,
  };
}

/**
 * Mirrors estimateProject() in genumsolutions-website/lib/project-pricing.ts:
 *   1. components total = Σ (catalogPrice × (1 + markup%) × qty)
 *   2. extras total = Σ extra.amount
 *   3. subtotal = base + components + extras
 *   4. bulk discount = first tier whose minQty ≤ total component qty
 *   5. beforeMinimum = subtotal − discount
 *   6. total = max(beforeMinimum, minimumOrder)
 */
export function estimateProject(
  input: ProjectPricingEstimateInput,
): ProjectPricingEstimate {
  const { pricing, links, catalogPrices } = input;

  if (pricing.priceStatus !== "approved") {
    return {
      available: false,
      packageBaseCharge: 0,
      componentsTotal: 0,
      extrasTotal: 0,
      subtotal: 0,
      discountPercent: 0,
      discountAmount: 0,
      beforeMinimum: 0,
      total: 0,
      minimumApplied: false,
      minimumOrder: 0,
      reason: "Rate on request",
    };
  }

  const lines = links
    .map((link) =>
      resolveLine(
        link,
        catalogPrices.get(link.productId) ?? 0,
        pricing.componentMarkupPercent,
      ),
    )
    .filter((line) => line.quantity > 0);

  const componentsTotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const extrasTotal = pricing.extras.reduce(
    (sum, extra) => sum + Math.max(0, extra.amount),
    0,
  );
  const packageBaseCharge = Math.max(0, pricing.packageBaseCharge);
  const subtotal = packageBaseCharge + componentsTotal + extrasTotal;

  const totalComponentQty = lines.reduce((sum, line) => sum + line.quantity, 0);
  const sortedTiers = [...pricing.bulkTiers].sort(
    (a, b) => b.minQty - a.minQty,
  );
  let discountPercent = 0;
  for (const tier of sortedTiers) {
    if (totalComponentQty >= tier.minQty) {
      discountPercent = tier.discountPercent;
      break;
    }
  }
  const discountAmount = Math.min(
    subtotal,
    Math.round((subtotal * discountPercent) / 100),
  );
  const beforeMinimum = subtotal - discountAmount;
  const total = Math.max(beforeMinimum, pricing.minimumOrder);

  return {
    available: true,
    packageBaseCharge,
    componentsTotal: Math.round(componentsTotal * 100) / 100,
    extrasTotal,
    subtotal: Math.round(subtotal * 100) / 100,
    discountPercent,
    discountAmount,
    beforeMinimum: Math.round(beforeMinimum * 100) / 100,
    total: Math.round(total * 100) / 100,
    minimumApplied:
      beforeMinimum < pricing.minimumOrder && pricing.minimumOrder > 0,
    minimumOrder: pricing.minimumOrder,
    reason: "",
  };
}

/** Format NPR the Nepali way (same output as the website's formatNPR). */
export function formatNPR(value: number): string {
  return `NPR ${Math.round(value).toLocaleString("en-IN")}`;
}
