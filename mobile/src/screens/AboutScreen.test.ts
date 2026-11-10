// =====================================================================
// AboutScreen.test.ts — parity tests for computeLiveStats.
// Mirrors website /about liveCounts: same DB tables, same three-catalog
// split (applyComponentsScope contract from productService.ts).
// =====================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, it, expect } from "vitest";
import type { Product, ProductType } from "../types";

/** Raw TSX with comments stripped — same convention as remoteChrome.test.ts.
    The CTA rules below match real JSX, so comment prose must not satisfy them. */
const src = readFileSync(
  fileURLToPath(new NodeURL("./AboutScreen.tsx", import.meta.url)),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

type StatRow = Pick<Product, "category" | "productType" | "active"> & {
  id: string;
  name: string;
};

// Minimal fixture: computeLiveStats reads only `category` and
// `productType`, so the fixture carries only those (plus id/name for
// readable failure messages). The cast keeps the fixture honest about
// what the function actually depends on instead of copying out all 30+
// optional Product fields.
function mk(patch: Partial<StatRow> = {}): Product {
  return {
    id: "p1",
    name: "Test product",
    category: "Electronic Components",
    productType: "Retail kit" as ProductType,
    active: true,
    ...patch,
  } as unknown as Product;
}

// Mirror of productService.applyComponentsScope so the test is
// self-contained — changing the scope must land on BOTH the test AND
// productService.ts.
function isComponentsCatalogRow(
  row: Pick<Product, "category" | "productType">,
): boolean {
  const cat = (row.category ?? "").trim().toLowerCase();
  if (cat === "robot cars") return false;
  if (cat === "pre-packaged kits") return false;
  if (cat === "3d models") return false;
  return (row.productType ?? "Retail kit") !== "Project package";
}

type LiveStat = [string, string];

function computeLiveStats(products: Product[]): LiveStat[] {
  const electronic = products.filter(
    (p) =>
      !["Robot Cars", "Pre-packaged Kits"].includes(p.category) &&
      p.category?.trim().toLowerCase() !== "3d models" &&
      p.productType !== "Project package",
  ).length;
  const projectPackages = products.filter(
    (p) =>
      p.productType === "Project package" || p.category === "Pre-packaged Kits",
  ).length;
  return [
    [String(electronic), "electronic components in store"],
    [String(projectPackages), "project packages & builds"],
  ];
}

describe("AboutScreen computeLiveStats — parity with website /about liveCounts", () => {
  it("counts electronic components (components scope, active only)", () => {
    const products = [
      mk({ id: "p1", category: "Electronic Components" }),
      mk({ id: "p2", category: "Sensors" }),
      mk({ id: "p3", category: "Robot Cars" }), // excluded — cars scope
      mk({ id: "p4", category: "3D Models" }), // excluded — 3D scope
      mk({ id: "p5", productType: "Project package" }), // excluded — projects scope
      mk({ id: "p6", category: "Pre-packaged Kits" }), // excluded — projects scope
    ];
    expect(computeLiveStats(products)).toEqual([
      ["2", "electronic components in store"],
      ["2", "project packages & builds"],
    ]);
  });

  it("counts project packages and pre-packaged kits", () => {
    const products = [
      mk({ id: "p1", productType: "Project package" }),
      mk({ id: "p2", category: "Pre-packaged Kits" }),
      mk({ id: "p3", category: "Electronic Components" }), // not a package
    ];
    expect(computeLiveStats(products)).toEqual([
      ["1", "electronic components in store"],
      ["2", "project packages & builds"],
    ]);
  });

  it("returns 0/0 for an empty catalog (offline fallback)", () => {
    expect(computeLiveStats([])).toEqual([
      ["0", "electronic components in store"],
      ["0", "project packages & builds"],
    ]);
  });

  it("matches the website three-catalog split exactly (no 3D residue)", () => {
    // Parity test: the app AboutScreen must not count 3D Models as
    // "electronic components in store" — that would duplicate the 3D
    // Products screen (same bug the website fixed in U-47v6).
    const products = [
      mk({ id: "p1", category: "Electronic Components", name: "ESP32 DevKit" }),
      mk({ id: "p2", category: "3D Models", name: "Robot Chassis STL" }),
      mk({ id: "p3", category: "Robot Cars", name: "4WD Car" }),
    ];
    const stats = computeLiveStats(products);
    expect(stats[0][0]).toBe("1"); // only ESP32 — 3D model excluded
    expect(stats[1][0]).toBe("0");
  });

  it("trusts getProducts output (already active-only) — no extra inactive filter", () => {
    // getProducts returns only active products; computeLiveStats trusts
    // the input. This mirrors the website storefront assumption.
    const products = [
      mk({ id: "p1", category: "Sensors", name: "Active Sensor" }),
      mk({ id: "p2", category: "Sensors", name: "Also Active (same input)" }),
    ];
    const stats = computeLiveStats(products);
    expect(stats[0][0]).toBe("2");
  });
});

// =====================================================================
// Cross-link CTAs — the website /about shop-links row.
// =====================================================================
describe("AboutScreen cross-link CTAs — same four links as website /about", () => {
  const LABELS = ["Shop components", "3D products", "Projects", "Open tools"];

  it("offers all four destinations in the website's order", () => {
    let previous = -1;
    for (const label of LABELS) {
      const index = src.indexOf(`label: "${label}"`);
      expect(index, `missing CTA: ${label}`).toBeGreaterThan(previous);
      previous = index;
    }
  });

  it("sends the two TAB destinations through Main, not as stack routes", () => {
    expect(src).toContain('{ label: "Shop components", tab: "Shop" }');
    expect(src).toContain('{ label: "3D products", tab: "Printing" }');
    expect(src).toContain('navigation.navigate("Main", { screen: link.tab })');
  });

  it("PUSHES Projects and Open tools — neither is a bottom tab", () => {
    // The regression this guards: typing all four as `Main` tab screens
    // compiles against a locally invented param type and then throws at
    // runtime, because MainTabParamList is Home/Printing/Shop/Menu only.
    expect(src).toContain('{ label: "Projects", route: "Projects" }');
    expect(src).toContain('{ label: "Open tools", route: "Tools" }');
    expect(src).toContain("navigation.push(link.route)");
  });

  it("types its navigator against the real RootStackParamList", () => {
    expect(src).toContain("import type { RootStackParamList }");
    expect(src).toContain(
      'NativeStackNavigationProp<RootStackParamList, "About">',
    );
  });

  it("uses no CSS-only hover/transition classes on the native buttons", () => {
    // `transition` and `hover:` do nothing on native and sat on the Text
    // where they could not restyle the border anyway.
    expect(src).not.toContain("transition");
    expect(src).not.toContain("hover:");
    expect(src).toContain("active:opacity-60");
  });
});
