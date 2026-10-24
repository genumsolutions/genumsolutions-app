// =====================================================================
// U-124 ⑨ (owner 2026-10-24) — the "Switch networks" panel gains a
// dropdown over the car-network field AND the phone/car network match
// prompt:
//
//   owner, verbatim: "there should be drop down selector too to select
//   the network of the car so that the app understands which network to
//   connect to" + "add a prompt to change the phone's network if the two
//   networks doesn match"
//
// Pins:
//   1. the chevron button opens the picker (testID `car-network-ssid-picker`);
//   2. the picker is a Modal listing `netChoices` — car hotspot first,
//      deduped — and picking FILLS the field (the existing ✓ persists, so
//      there is still exactly ONE save path);
//   3. the mismatch prompt renders only on the hub verdict
//      `carNetMatch === "different"` and it names the CAR's network —
//      the phone's own SSID label still has exactly one render site (the
//      Remote's first bar, pinned in phoneNetwork.test.ts), so this
//      prompt does NOT resurrect the removed "This phone" box;
//   4. the panel is never handed the phone's raw SSID (single copy).
// =====================================================================

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

function raw(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

/** Comments stripped; `//` preceded by `:` (URL literals) survives. */
function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

const section = strip(raw("./ConnectionSection.tsx"));

describe("U-124 ⑨ — the car-network dropdown + the mismatch prompt", () => {
  it("the field's chevron opens the picker", () => {
    expect(section).toContain('testID="car-network-ssid-picker"');
    expect(section).toContain("setSsidPickOpen(true)");
    expect(section).toContain(
      "accessibilityState={{ expanded: ssidPickOpen }}",
    );
  });

  it("the picker is a Modal over the deduped netChoices, and picking FILLS the field", () => {
    expect(section).toContain("const netChoices = useMemo(() => {");
    // The car's own hotspot leads (the way back to the car), then saved
    // routers, then what the car reports — deduped case-insensitively.
    expect(section).toContain("push(carApName);");
    expect(section).toContain("for (const r of routers) push(r.ssid);");
    expect(section).toContain("push(reportedSsid);");
    expect(section).toContain("if (seen.has(k)) return;");
    // One tap fills the draft; the row keeps one save path (the ✓).
    expect(section).toContain("setSsidDraft(c);");
    expect(section).toContain("setSsidPickOpen(false);");
    expect(section).toContain('testID="car-network-ssid-picker-cancel"');
    expect(section).toContain(
      'accessibilityLabel="Choose the car\'s network from a list"',
    );
  });

  it("the mismatch prompt keys off the hub verdict and names the CAR's network only", () => {
    expect(section).toContain('testID="car-net-mismatch"');
    expect(section).toContain('carNetMatch === "different" && reportedSsid');
    expect(section).toContain("{reportedSsid}");
    // It does NOT carry the phone's own label — the removed box stays
    // removed (phoneNetwork.test.ts pins the single render site).
    expect(section).not.toContain("phoneNetworkLabel");
    expect(section).not.toContain("phoneSsid");
    expect(section).not.toContain('testID="conn-phone-network"');
    expect(section).not.toContain("This phone");
  });

  it("the panel receives the verdict and still never RENDERS the phone's SSID label", () => {
    expect(section).toContain("carNetMatch,");
    // The section does use NetInfo (car discovery, 2026-10-10) — what must
    // never appear is the phone-network LABEL (its one render site is the
    // Remote's first bar, pinned in phoneNetwork.test.ts).
    expect(section).not.toContain("phoneNetworkLabel");
    expect(section).not.toContain("setPhoneSsid");
  });
});
