// =====================================================================
// printEstimate — the app's copy of the website's public estimate maths.
//
// The website calculates its calculator estimate with lib/print.ts
// (estimatePrint) from rates the admin published. The app must produce the
// SAME number for the same inputs, so this is a direct port of that pure
// function: material rate × grams × quantity, finishing charges, the design
// base charge, bulk tiers, then the minimum order. Keep the two in step — if
// the website changes a rule, change it here too.
//
// There is no hardcoded price anywhere in this file: every figure arrives in
// `settings` / `materialRatePerGram` from GET /api/print, and the route
// already suppresses rates until the owner approves pricing.
// =====================================================================

export type PrintEstimate = {
  available: boolean;
  totalGrams: number;
  quantity: number;
  materialCost: number;
  finishingCost: number;
  designCost: number;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  minimumApplied: boolean;
  reason?: string;
};

export type PrintEstimateRules = {
  minimumOrder: number;
  designBaseCharge: number;
  finishingCharges: Array<{ id: string; name: string; amount: number }>;
  bulkTiers: Array<{ minQty: number; discountPercent: number }>;
};

export type PrintEstimateInput = {
  weightGrams: number;
  quantity: number;
  materialRatePerGram: number;
  designRequested?: boolean;
  finishingIds?: string[];
  rules: PrintEstimateRules;
};

const roundRupees = (value: number) => Math.max(0, Math.round(value));

/** Mirrors estimatePrint() in genumsolutions-website/lib/print.ts. */
export function estimatePrint(input: PrintEstimateInput): PrintEstimate {
  const rules = input.rules;
  const weight = Math.max(0, Number(input.weightGrams) || 0);
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
  const rate = Math.max(0, Number(input.materialRatePerGram) || 0);
  const base: PrintEstimate = {
    available: false,
    totalGrams: weight * quantity,
    quantity,
    materialCost: 0,
    finishingCost: 0,
    designCost: 0,
    subtotal: 0,
    discountPercent: 0,
    discountAmount: 0,
    total: 0,
    minimumApplied: false,
  };

  if (weight <= 0)
    return { ...base, reason: "Enter the printed weight in grams." };
  if (rate <= 0)
    return {
      ...base,
      reason: "Online pricing for this material is being finalised.",
    };

  const materialCost = roundRupees(rate * weight * quantity);
  const finishingCost = roundRupees(
    (rules.finishingCharges ?? [])
      .filter((charge) => (input.finishingIds ?? []).includes(charge.id))
      .reduce(
        (sum, charge) => sum + Math.max(0, Number(charge.amount) || 0),
        0,
      ) * quantity,
  );
  const designCost = input.designRequested
    ? roundRupees(rules.designBaseCharge)
    : 0;
  const subtotal = materialCost + finishingCost + designCost;

  const tier = [...(rules.bulkTiers ?? [])]
    .filter((item) => quantity >= Math.max(1, Number(item.minQty) || 0))
    .sort((a, b) => b.minQty - a.minQty)[0];
  const discountPercent = tier
    ? Math.min(90, Math.max(0, Number(tier.discountPercent) || 0))
    : 0;
  // The design charge is effort, not volume: discounts apply to print + finish.
  const discountAmount = roundRupees(
    ((materialCost + finishingCost) * discountPercent) / 100,
  );
  const beforeMinimum = Math.max(0, subtotal - discountAmount);
  const minimumApplied = beforeMinimum < rules.minimumOrder;
  const total = roundRupees(
    minimumApplied ? rules.minimumOrder : beforeMinimum,
  );

  return {
    available: true,
    totalGrams: base.totalGrams,
    quantity,
    materialCost,
    finishingCost,
    designCost,
    subtotal,
    discountPercent,
    discountAmount,
    total,
    minimumApplied,
  };
}
