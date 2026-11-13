import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import type { CheckoutLine } from "../types";

// =====================================================================
// orders.items contract guard (app side).
//
// The app and the website write the same Supabase JSON column. The app used
// to write `priceNpr` while the website read `price`, so app orders showed
// as "NPR NaN" on the website. The canonical shape lives in the website repo
// (supabase/order-items.contract.json); this repo ships a verbatim copy
// (src/config/order-items.contract.json) and both CI pipelines diff them.
// =====================================================================

type Contract = {
  requiredKeys: string[];
  priceField: string;
  legacyReadOnlyPriceFields: string[];
};

const contract: Contract = JSON.parse(
  readFileSync(resolve(__dirname, "order-items.contract.json"), "utf8"),
);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) out.push(path);
  }
  return out;
}

describe("orders.items contract", () => {
  it("declares the price field the app writes", () => {
    expect(contract.requiredKeys).toContain(contract.priceField);
    expect(contract.requiredKeys).not.toContain("priceNpr");
  });

  it("CheckoutLine carries exactly the shared keys", () => {
    const line: CheckoutLine = {
      productId: "p1",
      name: "Kit",
      price: 500,
      quantity: 2,
    };
    expect([...Object.keys(line)].sort()).toEqual(
      [...contract.requiredKeys].sort(),
    );
  });

  it("no source writes a legacy price field", () => {
    const offenders = sourceFiles(resolve(__dirname, "..")).filter((file) => {
      const source = readFileSync(file, "utf8");
      return contract.legacyReadOnlyPriceFields.some((legacy) =>
        // A write is `priceNpr:` as an object key. Optional declarations
        // (`priceNpr?:`) and reads (`item.priceNpr`) do not match.
        new RegExp(`\\b${legacy}\\s*:`).test(source),
      );
    });
    expect(
      offenders.map((file) => file.replace(/\\/g, "/")),
      `write ${contract.priceField}, not a legacy price field`,
    ).toEqual([]);
  });

  it("checkout builds order lines with the shared price field", () => {
    const source = readFileSync(
      resolve(__dirname, "../screens/CheckoutScreen.tsx"),
      "utf8",
    );
    expect(source).toMatch(new RegExp(`\\b${contract.priceField}:`));
    expect(source).toMatch(/createOrder\(/);
  });

  it("matches the website's copy of the contract when the sibling repo is present", () => {
    const websiteCopy = resolve(
      __dirname,
      "../../../../genumsolutions-website/supabase/order-items.contract.json",
    );
    if (!existsSync(websiteCopy)) {
      // Website repo not checked out next to the app (CI) — the CI job diffs
      // the two copies instead.
      return;
    }
    expect(JSON.parse(readFileSync(websiteCopy, "utf8"))).toEqual(contract);
  });
});
