// =====================================================================
// U-117 — the Webpage switch tells the TRUTH.
//
// The owner's report: "the webpage toggle off button is not working". The
// car's half was already fixed car-side (serve path reads `pageOff_`, NVS
// `page_off` survives a power cycle, `/status` publishes `page_on`). Every
// remaining gap was app-side, and this file pins each one:
//
//   1. PARSE — `page_on` (WS JSON) and `;PAGE=ON|OFF` (STATE) were read by
//      NOBODY, so the app could never learn the car's page state. Absent or
//      garbage must stay "don't know" (undefined) — never a manufactured OFF.
//   2. ADOPT — the hub now applies it from the telemetry stream with the same
//      change-guard as its three siblings (steady echo persists nothing).
//   3. GUARD — the WIFICFG reply handler used to persist OUTSIDE its
//      change-guard, so every echo re-wrote the per-car profile.
//   4. MIRROR — `transportToggleRef` was rebuilt on every render with the
//      page slot forced to `null`, so the change-guard compared against null
//      forever. It now mirrors live state.
//   5. QUERY — the panel asks `WIFICFG;WIFI;PAGE;?` the moment a link comes
//      up; without it the switch showed an ASSUMED off after every
//      (re)connect while the car kept serving.
//   6. PANEL — the switch reads the honest name (`hub.pageOn`), and is
//      disabled while no link is up, like every other car-backed switch.
//   7. RENAME — `pageOff` held the page-ON value end to end. It is now
//      `pageOn`; no `pageOff` identifier survives in the code.
//
// No component test harness exists in this repo (no React Testing Library —
// see dualLinkConnect.test.ts), so the wiring rules read the raw sources with
// comments stripped, string literals KEPT.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";
import { parseTelemetryLine } from "../../services/carProtocol";

// --- part A: the parse — both surfaces, "don't know" on every bad path ---

describe("U-117 — parseTelemetryLine reads the car's page-server state", () => {
  it("`;PAGE=ON` = serving, `;PAGE=OFF` = turned off", () => {
    expect(
      parseTelemetryLine("STATE;MODE=4WD4M;WIFI=ON;BT=ON;PAGE=ON").pageOn,
    ).toBe(true);
    expect(
      parseTelemetryLine("STATE;MODE=4WD4M;WIFI=ON;BT=ON;PAGE=OFF").pageOn,
    ).toBe(false);
  });

  it('`"page_on":1|0` in the WS JSON is the same fact', () => {
    expect(parseTelemetryLine('{"page_on":1}').pageOn).toBe(true);
    expect(parseTelemetryLine('{"page_on":0}').pageOn).toBe(false);
  });

  it("an ABSENT field stays undefined — absence is never OFF", () => {
    expect(
      parseTelemetryLine("STATE;MODE=4WD4M;WIFI=ON").pageOn,
    ).toBeUndefined();
    expect(parseTelemetryLine("{}").pageOn).toBeUndefined();
  });

  it("wrong TYPE / garbage never manufactures a state", () => {
    expect(parseTelemetryLine('{"page_on":"1"}').pageOn).toBeUndefined();
    expect(parseTelemetryLine('{"page_on":null}').pageOn).toBeUndefined();
    expect(parseTelemetryLine('{"page_on":true}').pageOn).toBeUndefined();
    expect(
      parseTelemetryLine("STATE;MODE=4WD4M;PAGE=MAYBE").pageOn,
    ).toBeUndefined();
    expect(parseTelemetryLine("STATE;MODE=4WD4M;PAGE=").pageOn).toBeUndefined();
  });
});

// --- part B: the wiring — hub + panel, read from source (F-83) ---

const load = (name: string) =>
  readFileSync(fileURLToPath(new NodeURL(name, import.meta.url)), "utf8");

const strip = (raw: string) =>
  raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:"'\\])\/\/.*$/, "$1"))
    .join("\n");

const hub = strip(load("./useControlHub.ts"));
const screen = strip(load("../../screens/RemoteControlScreen.tsx"));

function slice(code: string, from: number, span: number): string {
  expect(from).toBeGreaterThan(-1);
  return code.slice(from, from + span);
}

describe("U-117 — the hub adopts and persists the page state honestly", () => {
  it("the telemetry stream adopts pageOn, change-guarded, persist inside", () => {
    const at = hub.indexOf('typeof t.pageOn === "boolean"');
    expect(at).toBeGreaterThan(0);
    const block = slice(hub, at, 420);
    expect(block).toContain("cur.pageOn !== t.pageOn");
    expect(block).toContain("setPageOnState(t.pageOn);");
    expect(block).toContain("persistPrefsRef.current?.({ pageOn: t.pageOn });");
    // persist sits INSIDE the guard (the block closes after it)
    expect(
      block.indexOf("persistPrefsRef.current?.({ pageOn: t.pageOn });"),
    ).toBeGreaterThan(block.indexOf("cur.pageOn !== t.pageOn"));
  });

  it("the PAGE reply branch PRECEDES the generic WIFICFG;WIFI; branch", () => {
    // U-120 B (owner 2026-10-22, mirror-trap guard): the car answers
    // `WIFICFG;WIFI;PAGE;ON|OFF`, which ALSO starts with `WIFICFG;WIFI;`.
    // If the generic Wi-Fi-transport branch ever ran first it would parse
    // `PAGE;ON` as a non-ON and adopt wifiEnabled=false while the page state
    // stayed stale — the exact shape of the car-side bug fixed this round
    // (the ;WIFI branch swallowing the nested ;WIFI;PAGE form).
    const pageAt = hub.indexOf('reply.startsWith("WIFICFG;WIFI;PAGE;")');
    const wifiAt = hub.indexOf('reply.startsWith("WIFICFG;WIFI;")');
    expect(pageAt).toBeGreaterThan(0);
    expect(wifiAt).toBeGreaterThan(pageAt);
  });

  it("the WIFICFG PAGE reply persists only on a real change", () => {
    const at = hub.indexOf('reply.startsWith("WIFICFG;WIFI;PAGE;")');
    expect(at).toBeGreaterThan(0);
    const block = slice(hub, at, 700);
    expect(block).toContain(
      "if (transportToggleRef.current.pageOn !== pageOn) {",
    );
    // persist INSIDE that if-block — never on a steady echo
    expect(block).toContain("persistPrefs({ pageOn });");
    expect(block.indexOf("persistPrefs({ pageOn });")).toBeGreaterThan(
      block.indexOf("if (transportToggleRef.current.pageOn !== pageOn) {"),
    );
  });

  it("the live mirror keeps the page state instead of resetting it to null", () => {
    const at = hub.indexOf("transportToggleRef.current = {\n    wifiEnabled,");
    expect(at).toBeGreaterThan(0);
    const block = slice(hub, at, 160);
    expect(block).toContain("pageOn,\n  };");
    expect(block).not.toContain("pageOn: null,");
  });

  it("the panel asks for the page state the moment a link is up", () => {
    expect(hub).toContain('which === "PAGE"');
    expect(hub).toContain('"WIFICFG;WIFI;PAGE;?"');
    expect(screen).toContain('hub.queryCarTransportToggle("PAGE")');
  });

  it("setPageOn sends the wire line and persists the honest key", () => {
    const at = hub.indexOf("const setPageOn = useCallback");
    expect(at).toBeGreaterThan(0);
    const block = slice(hub, at, 560);
    expect(block).toContain("setPageOnState(on);");
    expect(block).toContain("persistPrefsRef.current?.({ pageOn: on });");
    expect(block).toContain('`WIFICFG;WIFI;PAGE;${on ? "ON" : "OFF"}`');
    // no link → an honest message, never a silent no-op
    expect(block).toContain("connect to the car first");
  });

  it("the inverted `pageOff` name is GONE from every code path", () => {
    expect(hub).not.toContain("pageOff");
    expect(hub).not.toContain("setPageOff");
    expect(screen).not.toContain("hub.pageOff");
    expect(screen).not.toContain("hub.setPageOff");
    // the honest name is what the panel reads
    expect(screen).toContain("hub.pageOn === true");
    expect(screen).toContain("hub.setPageOn(on)");
  });
});

describe("U-117 — the Webpage switch behaves like its siblings", () => {
  it("is disabled while no link is up (Wi-Fi/BT switches set the rule)", () => {
    // U-121: `hub.pageOn === true` now also gates the chrome IP chip, so the
    // switch is anchored on ITS OWN writer — the rule is about the Switch.
    const at = screen.indexOf("hub.setPageOn(on)");
    expect(at).toBeGreaterThan(0);
    const block = slice(screen, at - 500, 700);
    expect(block).toContain("disabled={!linked}");
    expect(block).toContain("hub.setPageOn(on)");
  });
});
