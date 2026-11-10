// =====================================================================
// Guards the generated bundled catalog. If someone regenerates it against a
// different website catalog, or the file is hand-edited, these fail before
// the two surfaces can disagree on About.
// =====================================================================
import { describe, expect, it } from "vitest";

import { BUNDLED_PRODUCTS } from "./bundledProducts";
// Imported from the config module, not the service: the service pulls in the
// Supabase client, which has no business loading in a unit test.
import { PROJECT_CATEGORIES } from "./project-catalog";

/** The website's applyScope() rules (lib/catalog.ts), restated for the app. */
function componentCount(products: typeof BUNDLED_PRODUCTS): number {
  return products.filter(
    (p) =>
      !["Robot Cars", "Pre-packaged Kits"].includes(p.category) &&
      p.category?.trim().toLowerCase() !== "3d models" &&
      p.productType !== "Project package",
  ).length;
}

function packageCount(products: typeof BUNDLED_PRODUCTS): number {
  return products.filter(
    (p) =>
      p.productType === "Project package" || p.category === "Pre-packaged Kits",
  ).length;
}

describe("BUNDLED_PRODUCTS", () => {
  it("carries the website's full fallback catalog", () => {
    // 55 retail items + 2 3D models + 5 project packages, i.e. the same
    // inventory the live products table holds.
    expect(BUNDLED_PRODUCTS).toHaveLength(62);
  });

  it("has unique ids and the fields the screens render", () => {
    const ids = new Set(BUNDLED_PRODUCTS.map((p) => p.id));
    expect(ids.size).toBe(BUNDLED_PRODUCTS.length);

    for (const product of BUNDLED_PRODUCTS) {
      expect(product.id).toBeTruthy();
      expect(product.name).toBeTruthy();
      expect(product.category).toBeTruthy();
      expect(product.description).toBeTruthy();
      expect(Array.isArray(product.specs)).toBe(true);
      expect(typeof product.price).toBe("number");
      // Retail items carry "NPR 1,600"; quote-only rows (models, packages,
      // stock 0) carry "Request quote" on both surfaces.
      expect(product.priceLabel).toMatch(/^(NPR|Request quote)/);
    }
  });

  it("produces the counts the website's About page shows, offline included", () => {
    // 55 / 2 / 5 / 7 — the website's live numbers, which its fallback and this
    // bundle both reproduce, so About cannot disagree with /about.
    expect(componentCount(BUNDLED_PRODUCTS)).toBe(55);
    expect(
      BUNDLED_PRODUCTS.filter(
        (p) => p.category?.trim().toLowerCase() === "3d models",
      ),
    ).toHaveLength(2);
    expect(packageCount(BUNDLED_PRODUCTS)).toBe(5);
    expect(PROJECT_CATEGORIES).toHaveLength(7);
  });

  it("carries the project-package detail the Projects screen renders", () => {
    const packages = BUNDLED_PRODUCTS.filter(
      (p) => p.productType === "Project package",
    );
    expect(packages.length).toBeGreaterThan(0);
    for (const pkg of packages) {
      expect(pkg.projectCategory).toBeTruthy();
      expect(pkg.estimatedDuration).toBeTruthy();
      expect(pkg.description.length).toBeGreaterThan(40);
    }
  });
});
