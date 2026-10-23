// =====================================================================
// U-120 Phase D (owner items 7 + 9, 2026-10-22), pinned against the RAW
// source of DeviceConnectionScreen.tsx, comments stripped — the same
// convention as remoteChrome.test.ts (no component harness in this repo,
// so the rules are about which elements exist, in which card, wired to
// which hub facts). Each rule was written mutate → red, restore → green.
//
//   7. "the car's IP selection should have the network selector too along
//      with the broadcast IP … use the network name to select the car
//      network and to let the app know where the car is." — U-121 Phase B
//      (owner 2026-10-23): the selector is now a PROPER one — always
//      rendered (honest empty state), radio rows at real tap size, the car's
//      own hotspot + every saved router by NAME, the car's row marked; the
//      wifi-sta broadcast-IP field stays beside it. Picking prefills the
//      car's own reported lease (or its fixed AP address) and issues
//      ROUTERS;USE over a live link otherwise.
//   9. "the app still doesn't know its own network before connecting." —
//      the phone's own network label renders on THIS screen, above the
//      setup card, before any link exists.
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

const RAW_SCREEN = raw("./DeviceConnectionScreen.tsx");
const screen = strip(RAW_SCREEN);

/** The wifi-sta setup card — the one card with the broadcast-IP field. */
function staCard(): string {
  const start = screen.indexOf('case "wifi-sta"');
  const end = screen.indexOf("default:", start);
  if (start < 0 || end <= start) return "";
  return screen.slice(start, end);
}

/** The body of `const pickCarNetwork = useCallback(` … up to `return (`. */
function pickBody(): string {
  const start = screen.indexOf("const pickCarNetwork = useCallback(");
  const end = screen.indexOf("return (", start);
  if (start < 0 || end <= start) return "";
  return screen.slice(start, end);
}

describe("U-120 Phase D — item 7: the network selector by the IP field", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(RAW_SCREEN.length).toBeGreaterThan(3000);
    expect(screen).toContain('testID="car-network-selector"');
    expect(screen).toContain("const pickCarNetwork = useCallback(");
    expect(staCard().length).toBeGreaterThan(200);
  });

  it("the selector renders INSIDE the wifi-sta card, beside the IP field", () => {
    const sta = staCard();
    // The broadcast-IP field itself…
    expect(sta).toContain('placeholder="ws://192.168.1.42:81"');
    // …and the proper by-name selector right there with it.
    expect(sta).toContain('testID="car-network-selector"');
    expect(sta).toContain("onPickNetwork(row.ssid)");
    // U-121 Phase B: ALWAYS rendered — no `length > 0` gate hides it, the
    // empty state is honest copy instead of a disappearing card.
    expect(sta).not.toContain("carNetworks.length > 0 && (");
    expect(sta).toContain("No saved networks known yet");
    // The own-AP card (its own address field) stays plain — no selector.
    const apStart = screen.indexOf('case "wifi-ap-own"');
    const staStart = screen.indexOf('case "wifi-sta"');
    expect(apStart).toBeGreaterThan(0);
    expect(screen.slice(apStart, staStart)).not.toContain(
      "car-network-selector",
    );
  });

  it("the selector is a proper radio list of the car's networks (by NAME)", () => {
    const sta = staCard();
    // Rows are BUILT from car truth at the component level: the car's own
    // hotspot first, then every saved router by name (never a duplicate).
    expect(screen).toContain("const selectorRows:");
    expect(screen).toContain("...(carApName");
    expect(screen).toContain(".filter((s) => s !== carApName)");
    expect(screen).toContain("onCar: carSsid === ssid");
    // Radio rows: selected state, a real role, a real tap size (py-2.5).
    expect(sta).toContain('accessibilityRole="radio"');
    expect(sta).toContain("accessibilityState={{ selected: picked }}");
    expect(sta).toContain("px-3 py-2.5");
    expect(sta).toContain(
      "accessibilityLabel={`Select car network ${row.ssid}",
    );
    // The row the car is actually on says so.
    expect(sta).toContain("car is here");
    // The picked-name hint says where the car IS (or how it gets there).
    expect(sta).toContain("pickedNetwork === carSsid");
    expect(sta).toContain("The car is on ${pickedNetwork}");
    expect(sta).toContain("pickedNetwork === carApName");
  });

  it("picking resolves where the car is: its lease, its AP, or a move by name", () => {
    const body = pickBody();
    expect(body.length).toBeGreaterThan(300);
    expect(body).toContain("setPickedNetwork(ssid);");
    // Car's own hotspot → its FIXED AP address fills the dial field.
    expect(body).toContain("if (ssid === carApName) {");
    expect(body).toContain("setWifiUrl(`ws://${DEFAULT_AP_IP}:81`);");
    // Car ON that network → prefill the dial target from its reported IP.
    expect(body).toContain("if (carSsid === ssid) {");
    expect(body).toContain("setWifiUrl(`ws://${bare}:81`);");
    // Car elsewhere → tell it to join over a LIVE link only (the car cannot
    // hear a fire-and-forget with no link); the new IP then arrives on
    // STATE;IP and the hub's smart-link auto-dial prefills the field.
    expect(body).toContain("if (connected || wifiConnected) routerUse(ssid);");
  });

  it("the hub facts the selector needs are destructured from the hub", () => {
    expect(screen).toContain("carNetworks,");
    expect(screen).toContain("carApName,");
    expect(screen).toContain("carSsid,");
    expect(screen).toContain("routerUse,");
    expect(screen).toContain("carIp={telemetry.ip ?? null}");
    expect(screen).toContain("linked={connected || wifiConnected}");
  });
});

describe("U-120 Phase D — item 9: the phone's own network before connecting", () => {
  it("renders the hub's phone-network label on THIS screen", () => {
    expect(screen).toContain('testID="device-phone-network"');
    expect(screen).toContain("phoneNetworkLabel,");
    expect(screen).toContain('{phoneNetworkLabel ?? "…"}');
  });

  it("the row sits ABOVE the setup card — visible before any link", () => {
    const rowAt = screen.indexOf('testID="device-phone-network"');
    const setupAt = screen.indexOf("<SetupPanel");
    expect(rowAt).toBeGreaterThan(0);
    expect(setupAt).toBeGreaterThan(rowAt);
    // …and nothing gates it on link state (no conditional wrapper).
    const before = screen.slice(Math.max(0, rowAt - 200), rowAt);
    expect(before).not.toContain("linkReady");
    expect(before).not.toContain("connected");
  });
});
