import { describe, expect, it } from "vitest";
import {
  billedGramCost,
  costPrintJob,
  costingStatus,
  defaultPrintCosting,
  quoteMargin,
  type PrintCosting,
} from "./print-costing";
import {
  derivePrintReports,
  type PrintQuote,
} from "../services/printAdminService";

// These pin the maths the website's lib/print-costing.ts already ships: the
// app's admin must not disagree with the website about a margin.
const full: PrintCosting = {
  filamentCostPerGram: 2,
  wastagePercent: 10,
  electricityRatePerKwh: 10,
  printerWatts: 100,
  machineCost: 10000,
  machineLifeHours: 1000,
  maintenancePerHour: 2,
  labourPerHour: 100,
  packagingPerJob: 50,
  paymentFeePercent: 2,
  overheadPerMonth: 1000,
  monthlyOrderTarget: 10,
  targetMarginPercent: 60,
  notes: "",
};

describe("print costing", () => {
  it("starts empty so no cost is invented", () => {
    expect(defaultPrintCosting.filamentCostPerGram).toBe(0);
    expect(costingStatus(defaultPrintCosting).complete).toBe(false);
    expect(costingStatus(defaultPrintCosting).missing.length).toBeGreaterThan(
      0,
    );
  });

  it("prices a job from every input", () => {
    const job = costPrintJob(full, { grams: 100, printHours: 2 });
    expect(job.gramsBilled).toBe(110);
    expect(job.materialCost).toBe(220);
    expect(job.electricityCost).toBe(2);
    expect(job.machineCost).toBe(20);
    expect(job.maintenanceCost).toBe(4);
    expect(job.packagingCost).toBe(50);
    expect(job.paymentFee).toBe(5.92);
    expect(job.overheadAllocation).toBe(100);
    expect(job.total).toBe(401.92);
    expect(job.complete).toBe(true);
  });

  it("costs a billed gram with the waste allowance", () => {
    expect(billedGramCost(full)).toBeCloseTo(2.2, 5);
  });

  it("refuses to invent a margin", () => {
    expect(
      quoteMargin(full, {
        quotedAmount: 0,
        estimatedGrams: 100,
        printHours: 2,
      }),
    ).toBeNull();
    expect(
      quoteMargin(defaultPrintCosting, {
        quotedAmount: 800,
        estimatedGrams: 100,
        printHours: 2,
      }),
    ).toBeNull();
  });

  it("doubles the cost of a reprint", () => {
    const normal = quoteMargin(full, {
      quotedAmount: 800,
      estimatedGrams: 100,
      printHours: 2,
    });
    const reprint = quoteMargin(full, {
      quotedAmount: 800,
      estimatedGrams: 100,
      printHours: 2,
      reprint: true,
    });
    expect(normal?.cost).toBe(401.92);
    expect(normal?.marginPercent).toBe(49.76);
    expect(reprint?.cost).toBe(803.84);
    expect(reprint?.marginPercent).toBe(-0.48);
  });
});

function quote(part: Partial<PrintQuote>): PrintQuote {
  return {
    id: "q1",
    name: "Probe",
    email: "probe@example.com",
    phone: "",
    description: "probe job",
    material: "PLA",
    quantity: 1,
    dimensions: "",
    timeline: "",
    status: "new",
    adminNotes: "",
    quotedAmount: 0,
    estimatedGrams: 0,
    printHours: 0,
    reprint: false,
    createdAt: new Date().toISOString(),
    ...part,
  };
}

describe("print reports", () => {
  it("derives the same figures as the website panel", () => {
    const stats = derivePrintReports(
      [
        quote({
          id: "won",
          status: "completed",
          quotedAmount: 800,
          estimatedGrams: 100,
          printHours: 2,
        }),
        quote({ id: "open", status: "new" }),
      ],
      full,
    );
    const value = (label: string) =>
      stats.find((stat) => stat.label === label)?.value;
    expect(value("Quoted revenue")).toBe("NPR 800");
    expect(value("Average order")).toBe("NPR 800");
    // One won of two live enquiries (neither is cancelled/rejected).
    expect(value("Enquiry conversion")).toBe("50%");
    expect(value("Material used")).toBe("100 g");
    expect(value("Reprint rate")).toBe("0%");
    expect(value("Average gross margin")).toBe("49.8%");
  });

  it("prints dashes instead of guessing", () => {
    const stats = derivePrintReports([], defaultPrintCosting);
    const value = (label: string) =>
      stats.find((stat) => stat.label === label)?.value;
    expect(value("Quoted revenue")).toBe("NPR 0");
    expect(value("Average order")).toBe("—");
    expect(value("Enquiry conversion")).toBe("—");
    expect(value("Reprint rate")).toBe("—");
    expect(value("Average gross margin")).toBe("—");
    expect(value("Cost per quoted gram")).toBe("—");
  });
});
