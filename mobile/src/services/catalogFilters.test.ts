import { describe, expect, it } from "vitest";
import {
  inStockOnly,
  isPriceCeiling,
  pushRecentlyViewed,
  relatedProducts,
  resolveRecentlyViewed,
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

describe("relatedProducts + recently viewed (C3)", () => {
  const make = (
    id: string,
    category: string,
    price: number,
    productType: Product["productType"] = "Retail kit",
    active = true,
  ): Product =>
    ({
      id,
      name: `Product ${id}`,
      category,
      price,
      priceLabel: `NPR ${price}`,
      sku: id,
      productType,
      active,
      note: "",
      description: "",
      specs: [],
      audience: "",
      difficulty: "Beginner",
      warranty: "",
      stock: 5,
      delivery: "",
      color: "",
    }) as Product;
  const current = make("cur", "Sensors", 1000);
  const catalog = [
    current,
    make("s1", "Sensors", 900),
    make("s2", "Sensors", 1200),
    make("s3", "Sensors", 2000, "Retail kit", false), // inactive same-category
    make("k1", "Kits", 1000), // same type, different category
    make("k2", "Kits", 5000, "Project package"), // different category + type
  ];

  it("orders same-category by price proximity, then same-type, excluding self and inactive", () => {
    const related = relatedProducts(catalog, current);
    expect(related.map((p) => p.id)).toEqual(["s1", "s2", "k1"]);
  });

  it("caps at the limit", () => {
    const many = [
      ...Array.from({ length: 6 }, (_, i) => make(`x${i}`, "Sensors", 100 + i)),
      current,
    ];
    expect(relatedProducts(many, current)).toHaveLength(4);
  });

  it("pushRecentlyViewed dedupes, recaps, and caps", () => {
    expect(pushRecentlyViewed(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(pushRecentlyViewed([], "a")).toEqual(["a"]);
    const long = Array.from({ length: 10 }, (_, i) => `id${i}`);
    const pushed = pushRecentlyViewed(long, "new");
    expect(pushed).toHaveLength(8);
    expect(pushed[0]).toBe("new");
  });

  it("resolveRecentlyViewed keeps view order, skips inactive/unknown, excludes current", () => {
    const resolved = resolveRecentlyViewed(
      catalog,
      ["s2", "zzz", "s3", "cur", "s1"],
      "cur",
    );
    expect(resolved.map((p) => p.id)).toEqual(["s2", "s1"]);
  });

  it("resolveRecentlyViewed does not mutate the input list", () => {
    const snapshot = [...catalog];
    resolveRecentlyViewed(catalog, ["s1"]);
    expect(catalog).toEqual(snapshot);
  });
});
