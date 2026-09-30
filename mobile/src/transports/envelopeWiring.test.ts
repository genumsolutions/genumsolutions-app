// =====================================================================
// envelopeWiring.test.ts — pins the Phase B WIRING contract
// (Connection-Manager round 2026-09-30, plan §4).
//
// Phase A proved the envelope translates correctly in isolation. These
// tests pin the three claims Phase B actually adds, which are the ones
// that could put a wrong byte on a real car:
//
//   1. BYTE PARITY — an envelope reaches the transport as EXACTLY the line
//      the hand-written path would have sent, over both BT and WS. This
//      is the acceptance criterion from the roadmap, checked in CI so it
//      cannot regress silently between device rounds.
//   2. FAIL CLOSED — a malformed envelope emits NOTHING and returns a
//      readable reason (F-30: one error, never a silent or partial drop).
//   3. GATED — the shipped default refuses, so the second dialect is not
//      reachable from the app until the owner flips it (F-41).
//
// Plus the W-14 rule: a success result must not echo the encoded line,
// because for router ADD / wifiConfig that line IS the password.
// =====================================================================
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ENVELOPE_WIRE_DEPS,
  __resetEnvelopeIntakeForTests,
  encodeEnvelopeWire,
  isEnvelopeIntakeEnabled,
  setEnvelopeIntakeEnabled,
} from "./envelopeWiring";
import { ENVELOPE_VERSION } from "./commandEnvelope";
import { LinkManager, __setStorageForTests } from "./linkManager";
import type {
  Transport,
  TransportConnectOptions,
  TransportStatus,
} from "./types";

/** Minimal in-memory transport that records the exact bytes it received. */
function recordingTransport(id: string): Transport & { sent: string[] } {
  let status: TransportStatus = "idle";
  const t = {
    id: id as Transport["id"],
    label: id,
    radio: "wifi" as const,
    blurb: "",
    capabilities: ["drive", "telemetry"] as const,
    sent: [] as string[],
    isSupported: () => true,
    getStatus: () => status,
    isConnected: () => status === "connected",
    getTargetLabel: () => null,
    getLastError: () => null,
    async connect(_o?: TransportConnectOptions) {
      status = "connected";
    },
    async disconnect() {
      status = "idle";
    },
    async sendLine(line: string) {
      t.sent.push(line);
    },
    async requestState() {},
    onTelemetry() {
      return () => {};
    },
    onStatus() {
      return () => {};
    },
  };
  return t as never;
}

beforeEach(() => {
  __setStorageForTests({ getItem: async () => null, setItem: async () => {} });
  __resetEnvelopeIntakeForTests();
});
afterEach(() => {
  __setStorageForTests(null);
  __resetEnvelopeIntakeForTests();
});

describe("envelopeWiring — the canonical deps binding", () => {
  it("binds the REAL carProtocol builders, not copies", () => {
    // If someone re-implements a builder here instead of importing the
    // protocol's, this identity check is what catches it.
    expect(ENVELOPE_WIRE_DEPS.buildSpd(140)).toBe("SPD140");
    expect(ENVELOPE_WIRE_DEPS.buildTrim(-3)).toBe("TRIM-3");
    expect(ENVELOPE_WIRE_DEPS.canonicalCarToken("BT")).toBe("4WD4M");
    expect(ENVELOPE_WIRE_DEPS.SPEED_MIN).toBe(100);
    expect(ENVELOPE_WIRE_DEPS.SPEED_MAX).toBe(255);
  });

  it("still refuses free-text mode names after wiring (FIN-23)", () => {
    const r = encodeEnvelopeWire({
      v: ENVELOPE_VERSION,
      type: "mode",
      token: "obstacle_avoid",
    });
    expect(r.ok).toBe(false);
  });
});

describe("LinkManager.sendEnvelope — byte parity with the pre-envelope path", () => {
  it("puts the identical line on the wire as sendLine would (BT and WS)", async () => {
    for (const id of ["bt-classic", "wifi-ap-ws"] as const) {
      const viaEnvelope = new LinkManager();
      const t1 = recordingTransport(id);
      viaEnvelope.register(t1);
      await viaEnvelope.activate(id);
      const r = await viaEnvelope.sendEnvelope({
        v: ENVELOPE_VERSION,
        type: "speed",
        value: 140,
      });
      expect(r.ok).toBe(true);

      const viaLine = new LinkManager();
      const t2 = recordingTransport(id);
      viaLine.register(t2);
      await viaLine.activate(id);
      await viaLine.sendLine(ENVELOPE_WIRE_DEPS.buildSpd(140));

      // The acceptance criterion, byte for byte, on BOTH radios.
      expect(t1.sent).toEqual(t2.sent);
      expect(t1.sent).toEqual(["SPD140"]);
    }
  });

  it("emits the locked grammar for every envelope type", async () => {
    const m = new LinkManager();
    const t = recordingTransport("bt-classic");
    m.register(t);
    await m.activate("bt-classic");

    const cases: Array<[Record<string, unknown>, string]> = [
      [{ type: "drive", dir: "F" }, "F"],
      [{ type: "speed", value: 200 }, "SPD200"],
      [{ type: "servo", value: 90 }, "SERVO90"],
      [{ type: "steerLimit", value: 30 }, "STEER30"],
      [{ type: "trim", value: 5 }, "TRIM5"],
      [{ type: "estop" }, "ESTOP"],
      [{ type: "requestState" }, "REQ_STATE"],
      [{ type: "mode", token: "4WD4M" }, "4WD4M"],
      [{ type: "router", routerOp: "SCAN" }, "ROUTERS;SCAN"],
      [
        { type: "wifiConfig", wifiSsid: "Home", wifiPass: "p" },
        "WIFICFG;Home;p",
      ],
    ];
    for (const [body, line] of cases) {
      const r = await m.sendEnvelope({ v: ENVELOPE_VERSION, ...body });
      expect(r.ok, JSON.stringify(body)).toBe(true);
    }
    expect(t.sent).toEqual(cases.map(([, line]) => line));
    // Never a second grammar: no JSON survives to the wire.
    expect(t.sent.join("\n")).not.toMatch(/"v"|"type"/);
  });

  it("accepts a JSON string as well as an object", async () => {
    const m = new LinkManager();
    const t = recordingTransport("bt-classic");
    m.register(t);
    await m.activate("bt-classic");
    const r = await m.sendEnvelope(
      JSON.stringify({ v: ENVELOPE_VERSION, type: "drive", dir: "L" }),
    );
    expect(r.ok).toBe(true);
    expect(t.sent).toEqual(["L"]);
  });
});

describe("LinkManager.sendEnvelope — fails CLOSED", () => {
  it("emits nothing and explains why for a malformed envelope", async () => {
    const m = new LinkManager();
    const t = recordingTransport("bt-classic");
    m.register(t);
    await m.activate("bt-classic");

    const bad = await m.sendEnvelope({ v: 99, type: "drive", dir: "F" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain("version");

    // The whole point: the car saw NOTHING.
    expect(t.sent).toEqual([]);
  });

  it("refuses out-of-range values before they reach the car", async () => {
    const m = new LinkManager();
    const t = recordingTransport("bt-classic");
    m.register(t);
    await m.activate("bt-classic");

    const r = await m.sendEnvelope({
      v: ENVELOPE_VERSION,
      type: "speed",
      value: 42,
    });
    expect(r.ok).toBe(false);
    expect(t.sent).toEqual([]);
  });

  it("reports the link error (not a throw) when nothing is connected", async () => {
    const m = new LinkManager();
    m.register(recordingTransport("bt-classic"));
    const r = await m.sendEnvelope({
      v: ENVELOPE_VERSION,
      type: "drive",
      dir: "F",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/No active connection/i);
  });

  it("sendEnvelopeSafe never throws", async () => {
    const m = new LinkManager();
    await expect(
      m.sendEnvelopeSafe({ v: ENVELOPE_VERSION, type: "drive", dir: "F" }),
    ).resolves.toBeUndefined();
  });
});

describe("envelopeWiring — W-14: a success never echoes the password line", () => {
  it("returns no line for a router ADD, so the password cannot leak", async () => {
    const m = new LinkManager();
    const t = recordingTransport("bt-classic");
    m.register(t);
    await m.activate("bt-classic");

    const r = await m.sendEnvelope({
      v: ENVELOPE_VERSION,
      type: "router",
      routerOp: "ADD",
      ssid: "Home",
      pass: "hunter2",
    });
    expect(r.ok).toBe(true);
    // The car got the credentials; the caller got nothing back.
    expect(t.sent).toEqual(["ROUTERS;ADD;Home;hunter2"]);
    expect(JSON.stringify(r)).not.toContain("hunter2");
    expect(Object.keys(r)).toEqual(["ok"]);
  });
});

describe("envelopeWiring — the F-41 gate is OFF by default", () => {
  it("is disabled on a fresh module", () => {
    expect(isEnvelopeIntakeEnabled()).toBe(false);
  });

  it("flips only when explicitly set", () => {
    setEnvelopeIntakeEnabled(true);
    expect(isEnvelopeIntakeEnabled()).toBe(true);
    setEnvelopeIntakeEnabled(false);
    expect(isEnvelopeIntakeEnabled()).toBe(false);
  });

  it("does not change what sendLine does — the existing dialect is untouched", async () => {
    const m = new LinkManager();
    const t = recordingTransport("bt-classic");
    m.register(t);
    await m.activate("bt-classic");
    // Gate is off, yet the hand-written path still works identically.
    await m.sendLine("SPD150");
    expect(t.sent).toEqual(["SPD150"]);
  });
});
