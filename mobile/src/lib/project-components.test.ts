// U-45 Phase 2 (2026-09-27) — ported 1:1 from the website's
// tests/project-components.test.ts so both clients pin the same matcher
// behavior. Keep the two files in sync when either matcher changes.
import { describe, expect, it } from "vitest";
import {
  dedupeSuggestions,
  isComponentsCatalogRow,
  parseMaterialLabel,
  suggestComponent,
  suggestComponents,
  type CatalogCandidate,
} from "./project-components";

const catalog: CatalogCandidate[] = [
  { id: "esp32-dev-module", name: "ESP32 Dev Module", sku: "ESP32-DEV" },
  { id: "l298n-driver", name: "L298N Motor Driver", sku: "L298N" },
  {
    id: "sh1106-oled",
    name: "SH1106 OLED Display 1.3 inch",
    sku: "OLED-SH1106",
  },
  { id: "mpu6050", name: "MPU6050 IMU Sensor", sku: "IMU-MPU6050" },
  { id: "bo-motor", name: "BO Motor 3-6V", sku: "BO-MOTOR" },
];

describe("parseMaterialLabel", () => {
  it("parses leading 'N × ' quantities", () => {
    // Tokens are plural-stemmed ("motors"→"motor") — BOM text and catalog
    // names must meet in the same normalized space.
    expect(parseMaterialLabel("2 × DC motors")).toEqual({
      quantity: 2,
      tokens: ["dc", "motor"],
    });
  });

  it("strips parentheticals and is case-insensitive", () => {
    expect(parseMaterialLabel("MPU6050 IMU (I2C)").tokens).toEqual([
      "mpu6050",
      "imu",
    ]);
  });

  it("defaults quantity to 1", () => {
    expect(parseMaterialLabel("ESP32 Dev Module").quantity).toBe(1);
  });
});

describe("suggestComponent", () => {
  it("matches an exact alias outright", () => {
    const s = suggestComponent("ESP32 Dev Module", catalog, {
      "esp32 dev module": "esp32-dev-module",
    });
    expect(s).toMatchObject({
      productId: "esp32-dev-module",
      matchedBy: "alias",
      score: 1,
    });
  });

  it("ignores aliases pointing at products not in the catalog", () => {
    const s = suggestComponent("ESP32 Dev Module", catalog, {
      "esp32 dev module": "ghost-id",
    });
    expect(s.matchedBy).not.toBe("alias");
  });

  it("scores a clear similarity match", () => {
    const s = suggestComponent("1.3 inch SH1106 OLED (I2C)", catalog);
    expect(s).toMatchObject({
      productId: "sh1106-oled",
      matchedBy: "similarity",
    });
  });

  it("returns none below the threshold (never fabricates a match)", () => {
    const s = suggestComponent("Li-ion battery pack 18650", catalog);
    expect(s).toMatchObject({ productId: null, matchedBy: "none" });
    expect(s.label).toBe("Li-ion battery pack 18650");
  });

  it("carries the parsed quantity", () => {
    const s = suggestComponent("2 × DC motors", catalog);
    expect(s.quantity).toBe(2);
  });
});

describe("suggestComponents + dedupeSuggestions", () => {
  it("keeps order and skips blank lines", () => {
    const all = suggestComponents(["ESP32 Dev Module", "", "  "], catalog);
    expect(all).toHaveLength(1);
  });

  it("merges duplicate product ids, summing quantities", () => {
    // Real BOM line from the 4WD project — plural stems to "motor" so the
    // BO Motor catalog row matches; two such lines merge to qty 5.
    const all = suggestComponents(
      ["4 × BO/brushed motors", "1 × BO motor", "Mystery part"],
      catalog,
    );
    const deduped = dedupeSuggestions(all);
    const motor = deduped.find((s) => s.productId === "bo-motor");
    expect(motor?.quantity).toBe(5);
    expect(
      deduped.some((s) => s.productId === null && s.label === "Mystery part"),
    ).toBe(true);
  });

  it("does not match words from a different part family", () => {
    // "DC motors" is NOT a BO Motor — the alias map is the cure for those.
    const s = suggestComponent("2 × DC motors", catalog);
    expect(s.productId).toBeNull();
  });
});

describe("isComponentsCatalogRow (mobile mirror of applyScope components)", () => {
  it("includes ordinary electronic rows", () => {
    expect(
      isComponentsCatalogRow({
        category: "Sensors",
        productType: "Retail kit",
      }),
    ).toBe(true);
  });

  it("excludes the three reserved catalog categories (case-insensitively)", () => {
    expect(
      isComponentsCatalogRow({
        category: " Robot Cars ",
        productType: "Retail kit",
      }),
    ).toBe(false);
    expect(
      isComponentsCatalogRow({
        category: "PRE-PACKAGED KITS",
        productType: "Retail kit",
      }),
    ).toBe(false);
    expect(
      isComponentsCatalogRow({
        category: "3d models",
        productType: "Retail kit",
      }),
    ).toBe(false);
  });

  it("excludes project packages even in a misc category", () => {
    expect(
      isComponentsCatalogRow({
        category: "Project Packages",
        productType: "Project package",
      }),
    ).toBe(false);
  });
});
