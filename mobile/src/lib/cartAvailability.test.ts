import { describe, expect, it } from "vitest";
import { clampToStock, lineIssue } from "./cartAvailability";
import type { Product } from "../types";

const product = (patch: Partial<Product> = {}): Product =>
  ({
    id: "p1",
    name: "Test kit",
    category: "Components",
    price: 500,
    priceLabel: "NPR 500",
    stock: 5,
    active: true,
    productType: "Retail kit",
    ...patch,
  }) as Product;

describe("lineIssue", () => {
  it("accepts an active, in-stock, priced retail item", () => {
    expect(lineIssue(product())).toBeNull();
  });

  it("flags missing products", () => {
    expect(lineIssue(undefined)).toBe("missing");
    expect(lineIssue(null)).toBe("missing");
  });

  it("flags hidden products", () => {
    expect(lineIssue(product({ active: false }))).toBe("hidden");
  });

  it("flags quote-only project packages regardless of stock", () => {
    expect(lineIssue(product({ productType: "Project package" }))).toBe(
      "quote-only",
    );
    expect(
      lineIssue(product({ productType: "Project package", stock: 10 })),
    ).toBe("quote-only");
  });

  it("flags out-of-stock and unpriced items", () => {
    expect(lineIssue(product({ stock: 0 }))).toBe("out-of-stock");
    expect(lineIssue(product({ price: 0 }))).toBe("out-of-stock");
  });
});

describe("clampToStock", () => {
  it("clamps above stock down to available units", () => {
    expect(clampToStock(9, 3)).toBe(3);
  });

  it("keeps an in-range quantity", () => {
    expect(clampToStock(2, 3)).toBe(2);
  });

  it("never returns a quantity below one", () => {
    expect(clampToStock(0, 3)).toBe(1);
    expect(clampToStock(-4, 3)).toBe(1);
  });
});
