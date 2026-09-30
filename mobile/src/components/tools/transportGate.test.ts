import { describe, expect, it, vi } from "vitest";

// adapters.ts imports the three link singletons, which import react-native —
// which this Node test runner cannot parse (Flow syntax). Mock them exactly as
// adapters.test.ts does, so the REAL registry can be built here.
vi.mock("../../services/wifiService", () => ({
  wifiService: {
    isConnected: false,
    isConnecting: false,
    url: null as string | null,
    scan: vi.fn(async () => []),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    sendLine: vi.fn(async () => undefined),
    requestState: vi.fn(async () => undefined),
    waitForCarAnswer: vi.fn(async () => true),
    onTelemetry: vi.fn(() => () => undefined),
    onStatus: vi.fn(() => () => undefined),
  },
}));
vi.mock("../../services/sppService", () => ({
  sppService: {
    supported: true,
    isConnected: false,
    isConnecting: false,
    deviceName: null as string | null,
    currentAddress: null as string | null,
    scan: vi.fn(async () => []),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    sendLine: vi.fn(async () => undefined),
    requestState: vi.fn(async () => undefined),
    onTelemetry: vi.fn(() => () => undefined),
    onStatus: vi.fn(() => () => undefined),
  },
}));
vi.mock("../../services/bleService", () => ({
  bleService: {
    isConnected: false,
    deviceName: null as string | null,
    deviceId: null as string | null,
    scan: vi.fn(async () => []),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    sendLine: vi.fn(async () => undefined),
    requestState: vi.fn(async () => undefined),
    onTelemetry: vi.fn(() => () => undefined),
    onStatus: vi.fn(() => () => undefined),
  },
}));

import { PRIMARY_METHODS, isSelectable } from "./transportGate";
import { buildAllTransports } from "../../transports/adapters";
import type { Transport, TransportId } from "../../transports/types";

const ALL_TRANSPORTS = buildAllTransports();

/** A stand-in transport with the given id and isSupported() answer. */
function fake(id: TransportId, supported: boolean): Transport {
  return {
    id,
    label: id,
    radio: "wifi",
    blurb: "",
    capabilities: [],
    isSupported: () => supported,
  } as unknown as Transport;
}

describe("F-41 method gate", () => {
  it("admits exactly the three proven methods", () => {
    expect([...PRIMARY_METHODS].sort()).toEqual([
      "bt-classic",
      "wifi-ap-ws",
      "wifi-sta-ws",
    ]);
  });

  it("refuses a PRIMARY method whose adapter says it is unsupported", () => {
    // Both halves must hold: policy AND the adapter's own honesty. A firmware
    // regression that flips isSupported() to false must close the row.
    expect(isSelectable(fake("bt-classic", false))).toBe(false);
    expect(isSelectable(fake("wifi-sta-ws", false))).toBe(false);
  });

  // F-51: the HTTP adapter was FIXED (correct routes, SPD0 → /stop) but is not
  // PROVEN on a car. "Fixed" must never silently mean "un-gated".
  it("keeps HTTP parked even though its adapter now reports supported", () => {
    expect(isSelectable(fake("http", true))).toBe(false);
  });

  it("keeps every non-primary method parked regardless of isSupported()", () => {
    for (const id of [
      "bt-ble",
      "http",
      "mdns",
      "mqtt",
      "cloud-relay",
    ] as TransportId[]) {
      expect(isSelectable(fake(id, true))).toBe(false);
    }
  });

  // The real registry, not a hand-built list: this is the assertion that would
  // have caught a gated method being registered without the gate.
  it("admits only bt-classic, wifi-ap-ws and wifi-sta-ws from ALL_TRANSPORTS", () => {
    const selectable = ALL_TRANSPORTS.filter(isSelectable)
      .map((t) => t.id)
      .sort();
    expect(selectable).toEqual(["bt-classic", "wifi-ap-ws", "wifi-sta-ws"]);
  });

  it("keeps every method with a roadmapNote parked", () => {
    for (const t of ALL_TRANSPORTS) {
      if (t.roadmapNote) {
        expect(isSelectable(t)).toBe(false);
      }
    }
  });
});
