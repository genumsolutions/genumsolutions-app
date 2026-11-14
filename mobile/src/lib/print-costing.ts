/**
 * Internal 3D-print costing — port of the website's `lib/print-costing.ts`.
 *
 * INTERNAL ONLY. Nothing here is rendered on a customer surface; the public
 * calculator uses the approved per-gram SELLING rates instead (see
 * `printService.ts`). Keeping the two apart is the point: "price minus
 * filament" is not profit, and internal costs must never leak to customers.
 *
 * Pure functions so the admin panel and the tests share one definition.
 */

export type PrintCosting = {
  filamentCostPerGram: number;
  wastagePercent: number;
  electricityRatePerKwh: number;
  printerWatts: number;
  machineCost: number;
  machineLifeHours: number;
  maintenancePerHour: number;
  labourPerHour: number;
  packagingPerJob: number;
  paymentFeePercent: number;
  overheadPerMonth: number;
  monthlyOrderTarget: number;
  targetMarginPercent: number;
  notes: string;
};

/**
 * Every figure starts at 0 on purpose: an empty costing sheet must not invent
 * a cost. The only exceptions are wastage (10%) and the target margin (60%),
 * which are the handoff's stated starting assumptions.
 */
export const defaultPrintCosting: PrintCosting = {
  filamentCostPerGram: 0,
  wastagePercent: 10,
  electricityRatePerKwh: 0,
  printerWatts: 0,
  machineCost: 0,
  machineLifeHours: 0,
  maintenancePerHour: 0,
  labourPerHour: 0,
  packagingPerJob: 0,
  paymentFeePercent: 0,
  overheadPerMonth: 0,
  monthlyOrderTarget: 0,
  targetMarginPercent: 60,
  notes: "",
};

export type PrintJobInput = {
  /** Printed weight the slicer reports, in grams. */
  grams: number;
  /** Estimated machine time, in hours. */
  printHours: number;
  /** Operator + file-prep time, in hours. Defaults to 0. */
  labourHours?: number;
};

export type PrintJobCost = {
  gramsBilled: number;
  materialCost: number;
  electricityCost: number;
  machineCost: number;
  maintenanceCost: number;
  labourCost: number;
  packagingCost: number;
  paymentFee: number;
  overheadAllocation: number;
  /** Sum of every component. Not a selling price by itself. */
  total: number;
  /** True only when every input the total depends on has a real value. */
  complete: boolean;
  /** Human-readable list of the inputs still missing, for the admin UI. */
  missing: string[];
};

export const round2 = (value: number) =>
  Math.round((Number(value) || 0) * 100) / 100;
const nonNegative = (value: number) => Math.max(0, Number(value) || 0);

/** Inputs with no usable value, in the order they affect the total. */
export function costingGaps(costing: PrintCosting): string[] {
  const missing: string[] = [];
  if (nonNegative(costing.filamentCostPerGram) <= 0)
    missing.push("filament cost per gram");
  if (
    nonNegative(costing.electricityRatePerKwh) <= 0 ||
    nonNegative(costing.printerWatts) <= 0
  )
    missing.push("electricity rate and printer power");
  if (
    nonNegative(costing.machineCost) <= 0 ||
    nonNegative(costing.machineLifeHours) <= 0
  )
    missing.push("machine cost and useful hours");
  if (nonNegative(costing.labourPerHour) <= 0) missing.push("labour rate");
  if (
    nonNegative(costing.overheadPerMonth) <= 0 ||
    nonNegative(costing.monthlyOrderTarget) <= 0
  )
    missing.push("monthly overhead and order target");
  return missing;
}

export function costingStatus(costing: PrintCosting): {
  complete: boolean;
  missing: string[];
} {
  const missing = costingGaps(costing);
  return { complete: missing.length === 0, missing };
}

/** Filament cost per billed gram (with the waste allowance applied). */
export function billedGramCost(costing: PrintCosting): number {
  return (
    nonNegative(costing.filamentCostPerGram) *
    (1 + nonNegative(costing.wastagePercent) / 100)
  );
}

/**
 * Direct cost of one job. Overhead is allocated per job from the monthly
 * figure and the target order count; the payment fee is applied to the
 * subtotal as an allowance (the real fee depends on the gateway used).
 */
export function costPrintJob(
  costing: PrintCosting,
  input: PrintJobInput,
): PrintJobCost {
  const grams = nonNegative(input.grams);
  const printHours = nonNegative(input.printHours);
  const labourHours = nonNegative(input.labourHours ?? 0);
  const wastage = Math.min(100, nonNegative(costing.wastagePercent));
  const gramsBilled = round2(grams * (1 + wastage / 100));

  const materialCost = round2(
    gramsBilled * nonNegative(costing.filamentCostPerGram),
  );
  const electricityCost = round2(
    (nonNegative(costing.printerWatts) / 1000) *
      printHours *
      nonNegative(costing.electricityRatePerKwh),
  );
  const machineLifeHours = nonNegative(costing.machineLifeHours);
  const machineCost = round2(
    machineLifeHours > 0
      ? (nonNegative(costing.machineCost) / machineLifeHours) * printHours
      : 0,
  );
  const maintenanceCost = round2(
    nonNegative(costing.maintenancePerHour) * printHours,
  );
  const labourCost = round2(nonNegative(costing.labourPerHour) * labourHours);
  const packagingCost = round2(nonNegative(costing.packagingPerJob));
  const subtotal = round2(
    materialCost +
      electricityCost +
      machineCost +
      maintenanceCost +
      labourCost +
      packagingCost,
  );
  const paymentFee = round2(
    (subtotal * Math.min(100, nonNegative(costing.paymentFeePercent))) / 100,
  );
  const monthlyOrders = nonNegative(costing.monthlyOrderTarget);
  const overheadAllocation = round2(
    monthlyOrders > 0
      ? nonNegative(costing.overheadPerMonth) / monthlyOrders
      : 0,
  );

  const { complete, missing } = costingStatus(costing);
  return {
    gramsBilled,
    materialCost,
    electricityCost,
    machineCost,
    maintenanceCost,
    labourCost,
    packagingCost,
    paymentFee,
    overheadAllocation,
    total: round2(subtotal + paymentFee + overheadAllocation),
    complete,
    missing,
  };
}

/** Gross margin of a quoted price over a cost, in percent (0 when no price). */
export function grossMargin(price: number, cost: number): number {
  const priceValue = nonNegative(price);
  if (priceValue <= 0) return 0;
  return round2(((priceValue - nonNegative(cost)) / priceValue) * 100);
}

/**
 * Margin of a quote against the costing sheet, using the job's grams/hours.
 * Returns null when the quote has no price or the costing sheet is incomplete
 * — the admin must not see a "profit" number built on missing inputs.
 */
export function quoteMargin(
  costing: PrintCosting,
  quote: {
    quotedAmount: number;
    estimatedGrams: number;
    printHours: number;
    reprint?: boolean;
  },
): { cost: number; marginPercent: number; complete: boolean } | null {
  if (nonNegative(quote.quotedAmount) <= 0) return null;
  const job = costPrintJob(costing, {
    grams: quote.estimatedGrams,
    printHours: quote.printHours,
  });
  if (!job.complete) return null;
  // A reprint doubles the material and machine cost of the same job.
  const cost = quote.reprint ? round2(job.total * 2) : job.total;
  return {
    cost,
    marginPercent: grossMargin(quote.quotedAmount, cost),
    complete: true,
  };
}
