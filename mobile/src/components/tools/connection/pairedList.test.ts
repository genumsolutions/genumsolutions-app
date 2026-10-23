// =====================================================================
// U-120 Phase D (owner item 6, 2026-10-22) — "the list of the paired
// device contains dummy name paired car which is not needed."
//
// The dummy row IS the invented generonym: sppService falls back to the
// device's MAC when the OS reports no name, and friendlyBtDeviceName
// renders empty / raw-MAC / ≤2-char names as the placeholder
// "Paired car". Those entries are exactly what the owner asked to remove
// from the paired list.
//
// WHICH VIEW THIS READS (F-83): the RAW source of ConnectionSection.tsx,
// comments stripped — the same convention as remoteChrome.test.ts /
// dualLinkConnect.test.ts (no component harness in this repo). Every rule
// was written mutate → red, restore → green.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";

function raw(rel: string): string {
  return readFileSync(fileURLToPath(new NodeURL(rel, import.meta.url)), "utf8");
}

/** Comments stripped; `//` preceded by `:` (URL literals) survives. */
function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

const RAW_SECTION = raw("./ConnectionSection.tsx");
const section = strip(RAW_SECTION);

describe("U-120 Phase D — the paired list carries no dummy 'Paired car' row", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(RAW_SECTION.length).toBeGreaterThan(1000);
    expect(section).toContain('testID="conn-bt-paired"');
    expect(section).toContain("Paired cars");
    expect(section).toContain("friendlyBtDeviceName(");
    expect(section).toContain("const knownDevices = sppDevices.filter(");
  });

  it("filters the paired list on the NAME that would render 'Paired car'", () => {
    // The guard excludes exactly the entries whose display name would BE the
    // invented placeholder — a real name always renders.
    expect(section).toContain(
      '(d) => d.bonded && friendlyBtDeviceName(d.name) !== "Paired car"',
    );
  });

  it("the old address-based guard (which emptied the whole list) is gone", () => {
    // d.address is ALWAYS a MAC — sppService.connect() validates it — so the
    // previous `!MAC_ADDRESS_RE.test(d.address)` removed EVERY paired device.
    expect(section).not.toContain("!MAC_ADDRESS_RE.test(d.address)");
  });

  it("the placeholder rule itself survives (other surfaces still use it)", () => {
    // We remove the DUMMY ROWS, not the honesty rule: friendlyBtDeviceName
    // must keep mapping a nameless device to "Paired car" wherever else it
    // renders, and keep stripping underscores from real names.
    expect(section).toContain(
      'if (!n || MAC_ADDRESS_RE.test(n) || n.length <= 2) return "Paired car";',
    );
  });
});
