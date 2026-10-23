// =====================================================================
// U-120 Phase D (owner items 7 + 9, 2026-10-22), pinned against the RAW
// source of DeviceConnectionScreen.tsx, comments stripped — the same
// convention as remoteChrome.test.ts (no component harness in this repo,
// so the rules are about which elements exist, in which card, wired to
// which hub facts). Each rule was written mutate → red, restore → green.
//
//   7. "the car's IP selection should have the network selector too along
//      with the broadcast IP … use the network name to select the car
//      network and to let the app know where the car is." — a by-name
//      selector sits NEXT TO the wifi-sta broadcast-IP field: picking the
//      car's network prefills its reported lease when the car is on it,
//      and issues ROUTERS;USE over a live link otherwise.
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
    // …and the by-name selector right there with it.
    expect(sta).toContain('testID="car-network-selector"');
    expect(sta).toContain("onPickNetwork(ssid)");
    // The own-AP card (its own address field) stays plain — no selector.
    const apStart = screen.indexOf('case "wifi-ap-own"');
    const staStart = screen.indexOf('case "wifi-sta"');
    expect(apStart).toBeGreaterThan(0);
    expect(screen.slice(apStart, staStart)).not.toContain(
      "car-network-selector",
    );
  });

  it("the selector is driven by the car's own network facts (by NAME)", () => {
    const sta = staCard();
    expect(sta).toContain("carNetworks.map(");
    expect(sta).toContain("const onCar = carSsid === ssid;");
    expect(sta).toContain("accessibilityLabel={`Select car network ${ssid}");
    // The picked-name hint says where the car IS (or how it gets there).
    expect(sta).toContain("pickedNetwork === carSsid");
    expect(sta).toContain("The car is on ${pickedNetwork}");
  });

  it("picking resolves where the car is: its lease, or a move by name", () => {
    const body = pickBody();
    expect(body.length).toBeGreaterThan(300);
    expect(body).toContain("setPickedNetwork(ssid);");
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
