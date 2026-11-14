import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ADMIN_TAB_HINTS, ADMIN_TABS } from "./adminTabs";

// =====================================================================
// Admin-surface parity guard (was "ARCHITECTURE.md B-6"; that spec is NOT in
// the repo). The website AdminPanel
// and the app AdminScreen must expose the SAME tab inventory, in the SAME
// order. The website's canonical list lives in
// `components/admin/admin-types.ts` (TABS); the app's in
// `src/config/adminTabs.ts`. Change both + both tests together.
// =====================================================================

/**
 * Pull the hints map out of the source text. Values are single-line
 * double-quoted strings by construction (no quotes inside).
 */
function readHints(
  source: string,
  declaration: string,
): Record<string, string> {
  const block = source.match(
    new RegExp(`export const ${declaration}[^=]*= \\{([\\s\\S]*?)\\n\\};`),
  );
  const out: Record<string, string> = {};
  for (const line of (block?.[1] ?? "").split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:"([^"]+)"|([A-Za-z][\w ]*))\s*:\s*"([^"]*)"/,
    );
    if (!match) continue;
    const key = match[1] ?? match[2];
    if (key) out[key] = match[3] ?? "";
  }
  return out;
}

describe("admin tab inventory (website <-> app mirror, B-6)", () => {
  it("exposes the 8 canonical tabs in the canonical order", () => {
    // U-44 (2026-09-26, owner): Catalog split into three catalog tabs that
    // mirror the customer storefront (Electronic Products / 3D Products /
    // Projects). U-R3 (2026-10-12): "System Logs" added (fleet diagnostics).
    // U-R4 (2026-11-09): "User Logs" + "Profile Entries" added — both clients
    // read the shared user_activity_log / user_profile_entries tables.
    // U-R5: System Logs + User Logs + Profile Entries merged into "Logs".
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
      // website's literals double-quoted.
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

  // U-UI1 (2026-11-09): the per-tab description is shared console copy now —
  // the app renders ADMIN_TAB_HINTS under the strip and the website renders the
  // same sentences from TAB_HINTS. Guard coverage and cross-repo equality.
  it("describes every tab with the same sentences the website uses", () => {
    expect(Object.keys(ADMIN_TAB_HINTS).sort()).toEqual([...ADMIN_TABS].sort());
    for (const [tab, hint] of Object.entries(ADMIN_TAB_HINTS))
      expect(hint.length, `empty hint for ${tab}`).toBeGreaterThan(10);

    const websitePath = resolve(
      __dirname,
      "../../../../genumsolutions-website/components/admin/admin-types.ts",
    );
    if (!existsSync(websitePath)) return; // website repo absent (CI layout)
    const webHints = readHints(readFileSync(websitePath, "utf8"), "TAB_HINTS");
    expect(webHints).toEqual({ ...ADMIN_TAB_HINTS });
  });
});
