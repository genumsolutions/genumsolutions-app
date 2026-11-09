import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { clampGallery, IMAGE_BUDGET } from "./imageLimits";

// =====================================================================
// The two clients share one Supabase project on one free plan, so the image
// budget must be identical on both sides. The website owns the numbers
// (genumsolutions-website/lib/image-limits.ts); this test reads that file and
// fails when the app mirror drifts.
// =====================================================================

describe("image budget (website <-> app mirror)", () => {
  it("matches the website IMAGE_BUDGET numbers", () => {
    const websitePath = resolve(
      __dirname,
      "../../../../genumsolutions-website/lib/image-limits.ts",
    );
    if (!existsSync(websitePath)) {
      // Website repo not checked out next to the app (CI) — the constants
      // above are the contract; skip the cross-repo read.
      return;
    }
    const source = readFileSync(websitePath, "utf8");
    for (const [key, value] of Object.entries(IMAGE_BUDGET)) {
      const match = source.match(new RegExp(`${key}:\\s*([0-9*\\s/]+?)\\s*,`));
      expect(
        match,
        `IMAGE_BUDGET.${key} not found in the website source`,
      ).toBeTruthy();
      const parsed = match![1]
        .split("*")
        .map((part) => Number(part.trim()))
        .reduce((a, b) => a * b, 1);
      expect(parsed, `IMAGE_BUDGET.${key} differs from the website`).toBe(
        value,
      );
    }
  });

  it("caps a gallery at the per-item budget and drops duplicates", () => {
    const urls = Array.from(
      { length: 12 },
      (_, i) => `https://example.test/${i}.webp`,
    );
    const clamped = clampGallery([...urls, urls[0], "", null, "  "]);
    expect(clamped).toHaveLength(IMAGE_BUDGET.maxImagesPerItem);
    expect(clamped[0]).toBe(urls[0]);
    expect(new Set(clamped).size).toBe(clamped.length);
  });
});
