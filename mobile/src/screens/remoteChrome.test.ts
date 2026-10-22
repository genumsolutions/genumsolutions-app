// =====================================================================
// U-113 P2 (1.3.11 round) — the Remote screen chrome rebuild, pinned.
//
// Owner issues 2/3/4/10/14 of the 2026-10-15 list:
//   2. the line below Back (disconnect) and the tab-pills line merged into
//      ONE constant-height row — the deck below gains their ~28 px;
//   3. each disconnect chip appears only while ITS method is live and tears
//      down ONLY its own transport (the BT chip used to call the FULL
//      handleDisconnect and killed the Wi-Fi link with it);
//   4. the "on <phone-ssid>" chip is gone (the NetInfo discovery itself
//      stays — smart-link switching uses it);
//  10. the broadcast IP right of Back IS the link to the car's page; the
//      long "BT · name + WiFi · ip (AP)" label and the duplicate page chip
//      in the tabs row are gone;
//  14. both prompts (reconnect + car-restart) are OPAQUE, high-contrast
//      cards whose copy names the real connection state.
//
// WHICH VIEW THIS READS, and why (F-83): the RAW TypeScript/TSX source of
// `RemoteControlScreen.tsx` AND `useControlHub.ts`, comments stripped — the
// same convention as oneActiveLink.test.ts. These rules are about which
// elements/handlers exist in which JSX row and which helpers the hub
// exposes; there is no component harness in this repo (no React Testing
// Library), so a rendered assertion is unavailable. Every rule below was
// proven in BOTH directions (mutate → red, restore → green) when written.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";

function raw(rel: string): string {
  return readFileSync(fileURLToPath(new NodeURL(rel, import.meta.url)), "utf8");
}

/** Comments stripped — character literals NOT blanked (the rules match
    identifiers, call shapes and JSX classNames, never `'…'` literals). */
function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

const screen = strip(raw("./RemoteControlScreen.tsx"));
const hub = strip(raw("../components/tools/useControlHub.ts"));
const prompt = strip(raw("../components/tools/linkPrompt.ts"));

/** The body of `const <name> = useCallback(` … up to the next top-level
    `const <other> = useCallback(`. Anchor-based: empty slice ⇒ loud failure. */
function hubBody(name: string, nextName: string): string {
  const start = hub.indexOf(`const ${name} = useCallback(`);
  const end = hub.indexOf(`const ${nextName} = useCallback(`);
  if (start < 0 || end <= 0 || end <= start) return "";
  return hub.slice(start, end);
}

/** Occurrences of `needle` in `hay` (non-overlapping, line-based count). */
function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

describe("U-113 P2 — the Remote chrome rebuild", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(screen.length).toBeGreaterThan(5000);
    expect(hub.length).toBeGreaterThan(5000);
    expect(prompt.length).toBeGreaterThan(500);
    expect(screen).toContain('testID="remote-disconnect-bt"');
    expect(screen).toContain('testID="remote-disconnect-wifi"');
    expect(screen).toContain("renderPromptShell(");
  });

  it("issue 2: ONE merged row below Back (the second h-7 row is gone)", () => {
    // Exactly one constant-height row remains between the chrome row and the
    // content area; it carries the chips AND the pills. A second occurrence
    // means the old tabs row came back and the deck lost its 28 px again.
    expect(count(screen, "flex h-7 flex-shrink-0 flex-row")).toBe(1);
  });

  it("issue 4: the phone-net chip and its alternation are gone entirely", () => {
    // The chip, its selector and the 1 s NAME⇄IP alternation that lived with
    // it were removed from the SCREEN (phoneSsid is still exposed by the hub
    // for other surfaces; NetInfo discovery still feeds smart-link).
    expect(screen).not.toContain('testID="phone-net"');
    expect(screen).not.toContain("phoneSsid");
    expect(screen).not.toContain("netNameText");
    expect(screen).not.toContain("ipChipPhase");
  });

  it("issue 10: the IP chip right of Back is THE page link — one link only", () => {
    // Exactly one consumer of handleOpenWebPage remains in the screen: the
    // chrome chip (the definition + its single onPress). The old tabs-row
    // page chip would make this 3.
    expect(count(screen, "handleOpenWebPage")).toBe(2);
    expect(screen).toContain("onPress={handleOpenWebPage}");
    expect(count(screen, 'accessibilityRole="link"')).toBe(1);
    // The long label is gone; the chip renders the short transport label.
    expect(screen).not.toContain("deckLinkLabel");
    expect(screen).toContain("{linkLabel}");
    // No device name renders in the chrome label at all (A-25/A-38 kept by
    // construction — the helper that sanitized it is deleted, not dormant).
    expect(screen).not.toContain("friendlyBtName");
  });

  it("issue 3: chips are per-live-method and each tears down ONLY itself", () => {
    // The BT chip is gated on the per-method truth (btLinked), not the
    // shared `connected` flag that a Wi-Fi connect also sets.
    expect(screen).toContain("{btLinked ? (");
    expect(screen).toContain("{wifiConnected ? (");
    // Each chip calls its per-method disconnect. The full teardown
    // (`handleDisconnect`) must not be reachable from this screen anymore —
    // "handleBtDisconnect()" does NOT contain the "handleDisconnect()"
    // substring, so this assertion is exact.
    expect(screen).toContain("void handleBtDisconnect()");
    expect(screen).toContain("void handleWifiDisconnect()");
    expect(screen).not.toContain("handleDisconnect()");
  });

  it("issue 14: prompts are opaque, high-contrast cards with honest copy", () => {
    // Solid surface in BOTH themes + border-2 + shadow: nothing translucent
    // the screen text can read through (the old bg-*-50 tint merged with it).
    // Both tones carry the same solid pair — checking the tokens, not their
    // order inside the template literal.
    expect(screen).toContain("bg-white");
    expect(screen).toContain("dark:bg-slate-900");
    expect(screen).toContain("border-2");
    expect(screen).toContain("shadow-2xl");
    // The old translucent card surfaces are gone.
    expect(screen).not.toContain("bg-amber-50");
    expect(screen).not.toContain("bg-sky-50");
    // The reconnect copy names the real state (BT gone AND no Wi-Fi link);
    // the generic strings are gone. P1 (2026-10-17) moved the copy into the
    // pure `linkPrompt.ts` decision module, so the SCREEN now carries the call
    // and the module carries the words.
    expect(screen).toContain("resolveLinkPrompt(");
    expect(prompt).toContain("Bluetooth disconnected");
    expect(screen).not.toContain('"Connection lost"');
    expect(screen).not.toContain("Reconnect to your car?");
    // U-118 (owner 2026-10-20): the restart RECORD card is gone from the
    // deck — the prompt module carries the reconnect copy only, with no
    // "Link now:" line, no boot line and no reset detail.
    expect(prompt).not.toContain("Link now:");
    expect(prompt).not.toContain("bootLine");
  });
});

describe("U-113 P2 — the hub's per-method link truth (btLinked + handleBtDisconnect)", () => {
  it("has the state and keeps it current on every BT edge", () => {
    expect(hub).toContain("const [btLinked, setBtLinked] = useState(");
    // Set true on: mount reconcile (SPP + BLE branches), SPP connected, BLE
    // connected, manual SPP connect — five edges; four is a safe floor.
    expect(
      hub.match(/setBtLinked\(true\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(4);
    // Cleared on: SPP down ×2 (disconnected/error, guarded by BLE), BLE
    // down ×2 (guarded by SPP), and the manual BT disconnect — three floor.
    expect(
      hub.match(/setBtLinked\(false\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
  });

  it("each BT clear consults the OTHER BT transport first", () => {
    // SPP dropping must not hide a live BLE link and vice versa — the two
    // guards are the whole correctness argument for btLinked.
    expect(hub).toContain("if (!bleService.isConnected) setBtLinked(false);");
    expect(hub).toContain('setBtLinked(false);\n          setDeviceName("");');
  });

  it("handleBtDisconnect closes BT only and LEAVES Wi-Fi up", () => {
    const body = hubBody("handleBtDisconnect", "handleWifiProvision");
    expect(body.length).toBeGreaterThan(100);
    // Closes both BT transports (safe-stopped first)…
    expect(body).toContain("await sppService.disconnect()");
    expect(body).toContain("await bleService.disconnect()");
    expect(body).toContain("setBtLinked(false)");
    // …guarded un-verify when no Wi-Fi link remains…
    expect(body).toContain("if (!wifiService.isConnected)");
    // …and NEVER touches the Wi-Fi socket: this line is the whole point of
    // the helper (the old chip called the full handleDisconnect, which
    // disconnected Wi-Fi too).
    expect(body).not.toContain("wifiService.disconnect()");
  });
});

describe("Q2 (owner 2026-10-22) — the merged row drops telemetry FIRST", () => {
  it("has a source to check (the rule must not pass vacuously)", () => {
    expect(screen.length).toBeGreaterThan(5000);
  });

  it("the compact telemetry line is the ONLY width-gated thing in the row", () => {
    // The Q2 default: on a narrow phone the telemetry fields shrink/drop
    // first; the disconnect chips and the tab pills are controls and always
    // fit. Exactly ONE width gate exists in the whole screen and it wraps
    // TelemetryLine — a second gate would mean a control started hiding too,
    // and no gate would mean the telemetry line overflows the row again.
    expect(screen).toContain("const MERGED_ROW_TELEMETRY_MIN_PX = 700;");
    expect(count(screen, "width >= MERGED_ROW_TELEMETRY_MIN_PX")).toBe(1);
    expect(
      /width >= MERGED_ROW_TELEMETRY_MIN_PX \? \(\s*<TelemetryLine \{\.\.\.driveTelemetryArgs\} \/>\s*\) : null/.test(
        screen,
      ),
    ).toBe(true);
  });

  it("the chips and pills render ungated inside the one merged row", () => {
    // One merged row (issue 2's pin) carrying both controls unconditionally.
    expect(count(screen, "flex h-7 flex-shrink-0 flex-row")).toBe(1);
    expect(screen).toContain('testID="remote-disconnect-bt"');
    expect(screen).toContain('testID="remote-disconnect-wifi"');
    // The pill labels are multiline JSX (`>` … D-pad … `<`), so match
    // across whitespace rather than the adjacent-characters form.
    expect(
      (screen.match(/>[\s\n]*D-pad[\s\n]*</g) ?? []).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      (screen.match(/>[\s\n]*Connectivity[\s\n]*</g) ?? []).length,
    ).toBeGreaterThanOrEqual(1);
  });
});
