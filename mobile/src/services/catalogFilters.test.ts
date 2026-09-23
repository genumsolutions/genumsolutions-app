import { describe, expect, it } from "vitest";
import {
  inStockOnly,
  isPriceCeiling,
  sortProducts,
  withinPrice,
  type SortOption,
} from "./productService";
import type { Product } from "../types";

const make = (overrides: Partial<Product>): Product =>
  ({
    id: "x",
    name: "X",
    category: "Test",
    price: 0,
    priceLabel: "",
    sku: "",
    productType: "Retail kit",
    note: "",
    description: "",
    specs: [],
    audience: "",
    difficulty: "Beginner",
    warranty: "",
    stock: 0,
    delivery: "",
    color: "",
    ...overrides,
  }) as Product;

describe("sortProducts (C2, app parity with web lib/catalog.ts)", () => {
  const list: Product[] = [
    make({ id: "b", name: "Beta", price: 500 }),
    make({ id: "a", name: "Alpha", price: 1000 }),
    make({ id: "c", name: "Gamma", price: 250 }),
  ];

  it("featured preserves the curated order", () => {
    expect(sortProducts(list, "featured").map((p) => p.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("price-asc sorts by price with name tiebreak", () => {
    const tie = [
      make({ id: "x", name: "Zeta", price: 100 }),
      make({ id: "y", name: "Alpha", price: 100 }),
    ];
    expect(sortProducts(tie, "price-asc").map((p) => p.id)).toEqual(["y", "x"]);
    expect(sortProducts(list, "price-asc").map((p) => p.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("price-desc sorts high to low", () => {
    expect(sortProducts(list, "price-desc").map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("name sorts alphabetically", () => {
    expect(sortProducts(list, "name").map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("does not mutate the input list", () => {
    const original = [make({ id: "b", name: "Beta", price: 5 })];
    sortProducts(original, "name");
    expect(original[0].id).toBe("b");
  });
});

describe("price/stock filters (C2, app parity with web lib/catalog.ts)", () => {
  const list: Product[] = [
    make({ id: "cheap", price: 250, stock: 2 }),
    make({ id: "mid", price: 900, stock: 0 }),
    make({ id: "pricey", price: 4000, stock: 5 }),
    make({ id: "quote", price: 0, stock: 0 }),
  ];

  it("withinPrice keeps quote-only rows out of every ceiling", () => {
    expect(withinPrice(list, 500).map((p) => p.id)).toEqual(["cheap"]);
    expect(withinPrice(list, 10000).map((p) => p.id)).toEqual([
      "cheap",
      "mid",
      "pricey",
    ]);
  });

  it("withinPrice with ceiling 0 (any price) changes nothing", () => {
    expect(withinPrice(list, 0)).toHaveLength(4);
  });

  it("inStockOnly drops zero-stock rows", () => {
    expect(inStockOnly(list, true).map((p) => p.id)).toEqual([
      "cheap",
      "pricey",
    ]);
    expect(inStockOnly(list, false)).toHaveLength(4);
  });

  it("isPriceCeiling guards unknown values", () => {
    expect(isPriceCeiling(500)).toBe(true);
    expect(isPriceCeiling(750)).toBe(false);
    expect(isPriceCeiling(0)).toBe(true);
  });
});

describe("sort option type safety", () => {
  it("covers the same four options as the website", () => {
    const expected: SortOption[] = [
      "featured",
      "price-asc",
      "price-desc",
      "name",
    ];
    expect(expected).toHaveLength(4);
  });
});
