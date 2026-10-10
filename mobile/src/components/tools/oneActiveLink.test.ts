// =====================================================================
// U-98 — ONE active link at a time.
//
// The app used to leave BOTH transports connected: a Wi-Fi connect kept the
// Bluetooth SPP socket open (and `routeCommand` kept sending drive letters to
// it), and a Bluetooth connect kept the Wi-Fi socket reachable. Each transport's
// status handler then cleared the OTHER one's link truth, so a live, answered
// Wi-Fi link could read "Connecting…" forever while the REQ_STATE poll — keyed
// on `connected` — stopped running.
//
// WHICH VIEW THIS READS, and why (F-83): the RAW TypeScript source of
// `useControlHub.ts`, with block and line comments stripped. These rules are
// about which state writes exist inside which handler and in what order —
// there is no component test harness in this repo (no React Testing Library),
// so a rendered assertion is not available and a runtime double would have to
// fake the whole hub. The rule therefore reads `code()`, never the comment
// stream, and every rule below was proven in BOTH directions (mutate → red,
// restore → green) — results recorded in the commit body and the app ledger.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";

const RAW = readFileSync(
  fileURLToPath(new NodeURL("./useControlHub.ts", import.meta.url)),
  "utf8",
);

/** Comments stripped — character literals are NOT blanked here because this
    file's rules match identifiers and call shapes, never `'…'` literals. */
const code = RAW.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

/** The body of a `const <name> = useCallback(` … up to the next top-level
    `const <other> =` at the same indentation. Anchor-based: if the anchor is
    missing the slice is EMPTY and the rule that needs it fails loudly
    ("has sources to check"), never vacuously. */
function body(name: string, nextName: string): string {
  const start = code.indexOf(`const ${name} =`);
  const end = code.indexOf(`const ${nextName} =`);
  if (start < 0 || end < 0 || end <= start) return "";
  return code.slice(start, end);
}

/** The switch cases of the SPP status handler (its own subscription). */
function sppStatusCases(): string[] {
  const start = code.indexOf("const offStatus = sppService.onStatus");
  const end = code.indexOf("const offBleStatus = bleService.onStatus");
  if (start < 0 || end <= start) return [];
  const slice = code.slice(start, end);
  return slice
    .split(/case "/)
    .slice(1)
    .map((c) => c.split(/case "|default:/)[0] ?? c);
}

describe("U-98 — one live link, and each transport only speaks for itself", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(code.length).toBeGreaterThan(1000);
    expect(
      body("dropBluetoothForWifi", "handleWifiConnect").length,
    ).toBeGreaterThan(100);
    expect(sppStatusCases().length).toBeGreaterThanOrEqual(3);
  });

  it("tearing Bluetooth down for Wi-Fi never claims there is no link", () => {
    // THE BUG: `setConnected(false)` after `sppService.disconnect()` ran on a
    // Wi-Fi socket that was still up and had already answered the car — so the
    // status card went back to "Connecting…" (gold dot) and the 2 s REQ_STATE
    // poll, keyed on `connected`, stopped with a working link. The surviving
    // link owns `connected`.
    const helper = body("dropBluetoothForWifi", "handleWifiConnect");
    expect(helper).toContain("setConnected(wifiService.isConnected)");
    expect(helper).not.toContain("setConnected(false)");
  });

  it("the Bluetooth handler clears the link truth only when Bluetooth IS the link", () => {
    // Every SPP case that clears `connected`/`linkVerified` must sit behind
    // `!wifiService.isConnected`: a FAILED Bluetooth attempt leaves the Wi-Fi
    // socket up, and the Wi-Fi connect path tears SPP down deliberately —
    // neither may un-verify a link Bluetooth does not own.
    const cases = sppStatusCases();
    const clearing = cases.filter((c) => c.includes("setLinkVerified(false)"));
    expect(clearing.length).toBeGreaterThanOrEqual(2);
    for (const c of clearing) {
      expect(c).toContain("if (!wifiService.isConnected)");
      // the clear must be INSIDE that guard, not merely mentioned nearby
      expect(c.indexOf("if (!wifiService.isConnected)")).toBeLessThan(
        c.indexOf("setLinkVerified(false)"),
      );
    }
  });

  it("every Wi-Fi success path drops the Bluetooth link it would otherwise leave up", () => {
    // Four ways a Wi-Fi link becomes live: the address the user gave, the two
    // automatic finds (stale-lease rescue + refused-connection rescue), and
    // U-80b's phone-network-change auto-find. Each must tear Bluetooth down or
    // the car stays reachable on both.
    const calls = code.match(/dropBluetoothForWifi\(\)/g) ?? [];
    expect(calls.length).toBe(4);
  });

  it("dropping the Wi-Fi link leaves nothing verified", () => {
    // With one live link at a time, a manual Wi-Fi disconnect ends the
    // session: a stale `linkVerified = true` would read as "live" on the next
    // status paint before any car has answered.
    const helper = body("handleWifiDisconnect", "handleWifiProvision");
    expect(helper).toContain("setLinkVerified(false)");
  });
});
