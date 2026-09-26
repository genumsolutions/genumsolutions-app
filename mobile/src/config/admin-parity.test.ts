import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ADMIN_TABS } from "./adminTabs";

// =====================================================================
// Admin-surface parity guard (ARCHITECTURE.md B-6): the website AdminPanel
// and the app AdminScreen must expose the SAME tab inventory, in the SAME
// order. The website's canonical list lives in
// `components/admin/admin-types.ts` (TABS); the app's in
// `src/config/adminTabs.ts`. Change both + both tests together.
// =====================================================================

describe("admin tab inventory (website <-> app mirror, B-6)", () => {
  it("exposes the 8 canonical tabs in the canonical order", () => {
    // U-44 (2026-09-26, owner): Catalog split into three catalog tabs that
    // mirror the customer storefront (Electronic Products / 3D Products /
    // Projects).
    expect(ADMIN_TABS).toEqual([
      "Dashboard",
      "Orders",
      "Electronic Products",
      "3D Products",
      "Projects",
      "Content",
      "Users",
      "Settings",
    ]);
  });

  it("matches the website AdminPanel TABS list (read from the sibling repo)", () => {
    const websitePath = resolve(
      __dirname,
      "../../../../genumsolutions-website/components/admin/admin-types.ts",
    );
    if (!existsSync(websitePath)) {
      // Website repo not checked out next to the app (CI) — canonical list
      // above is the contract; skip the cross-repo read.
      return;
    }
    const source = readFileSync(websitePath, "utf8");
    const match = source.match(/export const TABS = \[([^\]]+)\] as const/);
    expect(match, "admin-types.ts TABS declaration not found").toBeTruthy();
    const webTabs = (match![1] ?? "")
      .split(",")
      // Quote-agnostic strip: prettier (singleQuote:false) may render the
      // website's literals double-quoted (2026-09-23 sweep).
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    expect(webTabs).toEqual([...ADMIN_TABS]);
  });

  it("is reflected verbatim in the app AdminScreen tab strip", () => {
    const screenPath = resolve(__dirname, "../screens/AdminScreen.tsx");
    const source = readFileSync(screenPath, "utf8");
    for (const tab of ADMIN_TABS) {
      // Quote-agnostic: prettier may render literals with ' or " — the
      // contract is the tab string itself, not the surrounding quote style.
      const singleQuoted = source.includes(`'${tab}'`);
      const doubleQuoted = source.includes(`"${tab}"`);
      expect(
        singleQuoted || doubleQuoted,
        `tab '${tab}' not found in AdminScreen.tsx`,
      ).toBe(true);
    }
  });
});
