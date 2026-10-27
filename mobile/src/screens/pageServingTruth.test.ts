// =====================================================================
// U-124 ⑫ (owner 2026-10-24) — "webpage shows white screen in browser and
// the ip is not hidden anywhere … fix these when webpage is off and make
// things sensible."
//
// The app half of that report, root-caused and pinned here:
//
//   1. `hub.carPageServing` was a useRef whose triple NOTHING ever wrote
//      (no assignment to pageStateTriple.current exists anywhere in the
//      hook), so it stayed `{current:false, old:false, changeFlag:false}`
//      — and the Remote chip read `hub.carPageServing?.current`, which on
//      a ref-of-triple is the OBJECT. An object is always truthy, so the
//      broadcast-IP chip rendered no matter what the car reported. The
//      public opinion is now the OBJECT ITSELF, derived at render time
//      from `pageOn`, so `.current` is a real boolean.
//   2. The chip's gate had no live-link half, though its own comment and
//      storyboard.md §1 promised "a live link AND the car serves its
//      page". It is now `linked && opinion`.
//   3. The Connectivity card's "Control address" row showed the dial
//      address even with the page off — a second place the IP was "not
//      hidden". It now hides on the same opinion.
//
// The FIRMWARE half (the white screen: serveGhostPage wrote its body past
// an honest Content-Length: 0, so the browser rendered nothing) is pinned
// in Genum_4WD4M_CAR/tools/check-firmware-contract.mjs rule `page-state`.
// =====================================================================

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isCarPageReachable } from "../components/tools/CarPageServingState";

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

const hub = strip(raw("../components/tools/useControlHub.ts"));
const screen = strip(raw("./RemoteControlScreen.tsx"));
const section = strip(
  raw("../components/tools/connection/ConnectionSection.tsx"),
);

describe("U-124 ⑫ — the broadcast IP hides when the car's page is off", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(hub.length).toBeGreaterThan(10_000);
    expect(screen.length).toBeGreaterThan(5000);
    expect(section.length).toBeGreaterThan(5000);
  });

  it("the hub's public opinion is a real boolean derived from pageOn", () => {
    // The opinion is derived at render time — `current` is `pageOn === true`,
    // so the Remote's read (`hub.carPageServing?.current`) is finally a
    // boolean that flips with the car's `;PAGE=`/`page_on` report.
    expect(hub).toContain("const pageServingNow = pageOn === true;");
    expect(hub).toContain("const carPageServing: CarPageServingState = {");
    expect(hub).toContain("current: pageServingNow,");
    // …and it is returned as the OBJECT, not a ref of one.
    expect(hub).toContain("\n    carPageServing,");
    expect(hub).not.toContain("carPageServing: pageStateTriple");
    // The never-written ref that made the old opinion an always-truthy
    // object is gone.
    expect(hub).not.toContain("useRef<CarPageServingState>({");
  });

  it("old/changeFlag keep the U-120 shape (steady frame lags one commit)", () => {
    expect(hub).toContain("const pageStateOld = useRef<boolean>(false);");
    expect(hub).toContain("old: pageStateOld.current,");
    expect(hub).toContain(
      "changeFlag: pageStateOld.current !== pageServingNow,",
    );
    expect(hub).toContain("pageStateOld.current = pageServingNow;");
  });

  it("the webpage is reachable only while page and Wi-Fi are enabled", () => {
    expect(
      isCarPageReachable(
        { current: true, old: true, changeFlag: false },
        true,
      ),
    ).toBe(true);
    expect(
      isCarPageReachable(
        { current: true, old: true, changeFlag: false },
        false,
      ),
    ).toBe(false);
    expect(
      isCarPageReachable(
        { current: false, old: false, changeFlag: false },
        true,
      ),
    ).toBe(false);
    expect(
      isCarPageReachable(
        { current: true, old: true, changeFlag: false },
        null,
      ),
    ).toBe(true);
  });

  it("the webpage switch sends only the page-server command", () => {
    const start = hub.indexOf("const setPageOn = useCallback");
    const end = hub.indexOf("const sendEnvelopeCommand = useCallback", start);
    expect(end).toBeGreaterThan(start);
    const pageToggle = hub.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(pageToggle).toContain(
      'WIFICFG;WIFI;PAGE;${on ? "ON" : "OFF"}',
    );
    expect(pageToggle).not.toContain("setWifiEnabled");
    expect(pageToggle).not.toContain("setCarTransportToggle");
  });

  it("the Remote chip gate requires a live link, page, Wi-Fi, and a known IP", () => {
    expect(screen).toContain(
      "isCarPageReachable(hub.carPageServing, hub.wifiEnabled) &&",
    );
    expect(screen).toContain("pageIp !== null;");
    expect(screen).toContain("{pageLinkReady ? (");
    // The old always-truthy gate string cannot come back.
    expect(screen).not.toContain(
      "const pageLinkReady = hub.carPageServing?.current ?? false;",
    );
    // The chip's gate never reads the raw cell — the opinion is the only
    // path (U-120's rule). The Webpage TOGGLE still reads `hub.pageOn` for
    // its own switch state (U-117, by design); the gate line must not.
    const gateLine = screen
      .split("\n")
      .find((l) => l.includes("const pageLinkReady"));
    expect(gateLine ?? "").not.toContain("hub.pageOn");
  });

  it("the card's Control address hides when the page or Wi-Fi is off", () => {
    // The row + its caption live inside the opinion's branch — the second
    // surface where the IP was "not hidden anywhere".
    expect(section).toContain(
      "isCarPageReachable(carPageServing, wifiEnabled) && controlIp !== null;",
    );
    expect(section).toContain("{controlPageReachable ? (");
    expect(section).toContain('testID="car-network-ip"');
    expect(section).toContain("carPageServing,");
    expect(section).toContain("const controlIp = carWebPageIp({");
    expect(section).not.toContain("?? DEFAULT_AP_IP");
    expect(section).not.toContain("value={controlIp}");
    // The Remote telemetry IP is gated by the same page/Wi-Fi truth.
    expect(screen).toContain("{pageLinkReady && pageIp ? (");
  });
});
