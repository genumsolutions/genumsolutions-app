// =====================================================================
// P6 / issue 1 (2026-10-16) — the SECOND link must be reachable from the UI.
//
// Issue 1 asks for the app and the car connected over Bluetooth AND Wi-Fi at
// the same time. The keep-both plumbing below the panel was already additive
// (oneActiveLink.test.ts / linkManager.test.ts prove no teardown exists), and
// the firmware's U-79 loop keeps both transports up with no teardown either.
// What actually stopped it was one line in this panel:
//
//     {target.id === "bt-spp" && !linkLive ? ( … Find my car … )}
//
// `linkLive` was the SHARED "any link up" flag (`btLive || wifiConnected`), so
// the moment Wi-Fi connected, the Bluetooth scan button vanished — and because
// `sppDevices` is populated ONLY by a scan (`handleScan` in useControlHub.ts),
// the paired list below stayed empty. Wi-Fi-second already worked: the Wi-Fi
// Connect button is never gated on Bluetooth. So the dual link was one-sided,
// and this file pins the two directions.
//
// WHY THIS READS SOURCE (F-83): there is no component test harness in this repo
// (no React Testing Library — see the same note in ../oneActiveLink.test.ts), so
// a rendered assertion is not available. These rules therefore read the raw
// `ConnectionSection.tsx` with comments stripped, and each one was proven in
// BOTH directions (mutate → red, restore → green) when it was written.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";

const RAW = readFileSync(
  fileURLToPath(new NodeURL("./ConnectionSection.tsx", import.meta.url)),
  "utf8",
);

/** Comments stripped, string literals KEPT: these rules match JSX conditions
    built out of literals like "bt-spp". Safe here: this file contains no `//`
    inside a string literal (checked when it was written). */
const code = RAW.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

/** Every index at which `needle` occurs in `code`. */
function all(needle: string): number[] {
  const out: number[] = [];
  let at = code.indexOf(needle);
  while (at >= 0) {
    out.push(at);
    at = code.indexOf(needle, at + needle.length);
  }
  return out;
}

/** A slice of `code` starting at `from`, bounded by `span` characters — used
    where a JSX branch is what the rule is about and pulling the whole function
    would drag in the unrelated branch beside it. */
function slice(from: number, span: number): string {
  return code.slice(from, from + span);
}

describe("P6 — the second link is reachable (issue 1: dual BT+Wi-Fi)", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(RAW.length).toBeGreaterThan(1000);
    expect(code).toContain("function TargetBody({");
    expect(code).toContain('testID="conn-bt-scan"');
    expect(code).toContain("<BtInventory");
  });

  it("the Bluetooth scan gate keys on BLUETOOTH being live, not on any link", () => {
    // The defect: `&& !linkLive` where linkLive = btLive || wifiConnected.
    // One of these assertions is red for each half of that sentence: the first
    // fails if the predicate is widened again, the second fails if it is left
    // keyed to a shared flag at all.
    expect(code).toContain('{target.id === "bt-spp" && !btLive ? (');
    expect(code).not.toContain('target.id === "bt-spp" && !linkLive');
  });

  it("the shared `linkLive` prop is gone from the panel, not merely unused", () => {
    // Leaving it declared and unconnected would let the next refactor wire the
    // old shared flag straight back in. It must be absent from the signature,
    // the type, and the call site.
    expect(code).not.toContain("linkLive");
  });

  it("TargetBody derives its own liveness from sppStatus, not from wifiConnected", () => {
    // Two definitions: the section's own `btLive` (outer scope) and this one
    // inside TargetBody, which is the value the gate reads. If TargetBody were
    // fed `wifiConnected` — or fed the shared anyLink — the gate would go dark
    // the moment Wi-Fi connects, which is the defect this file exists for.
    const needle = 'const btLive = sppStatus === "connected";';
    const defs = all(needle);
    expect(defs.length).toBe(2);

    const fnAt = code.indexOf("function TargetBody({");
    const gateAt = code.indexOf('{target.id === "bt-spp" && !btLive ? (');
    expect(fnAt).toBeGreaterThan(0);
    expect(gateAt).toBeGreaterThan(fnAt);

    // one definition sits inside TargetBody, and BEFORE the gate that reads it
    const inner = defs.filter((d) => d > fnAt);
    expect(inner.length).toBe(1);
    expect(inner[0]).toBeLessThan(gateAt);

    // it is fed Bluetooth's own service status, never the Wi-Fi flag
    expect(code).not.toContain("const btLive = wifiConnected");
    expect(code).not.toContain("const btLive = btLive ||");
  });

  it("the paired-cars inventory is not hidden by a live Wi-Fi link", () => {
    // `sppDevices` only ever gets filled by a scan, so if this list were gated
    // on the shared link flag the second link would be unreachable even with
    // the button present. It renders on the method alone.
    const at = code.indexOf("<BtInventory");
    expect(at).toBeGreaterThan(0);
    const block = slice(at - 120, 260);
    expect(block).toContain('method === "bluetooth"');
    expect(block).toContain("devices={knownDevices}");
    expect(block).not.toContain("anyLink");
    expect(block).not.toContain("wifiConnected");
  });

  it("the Wi-Fi Connect button is never gated on Bluetooth", () => {
    // The mirror direction, which is the half that already worked and must not
    // be "balanced" into a symmetric block later.
    const at = code.indexOf('{target.id === "car-wifi" ? (');
    expect(at).toBeGreaterThan(0);
    const block = slice(at, 700);
    expect(block).toContain("disabled={busy || Boolean(unavailable)}");
    expect(block).not.toContain("btLive");
    expect(block).not.toContain("sppStatus");
    expect(block).not.toContain("linkLive");
  });
});
