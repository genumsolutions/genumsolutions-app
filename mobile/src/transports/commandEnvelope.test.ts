// =====================================================================
// commandEnvelope.test.ts — pins the JSON ⇄ wire translation contract
// (Connection-Manager round 2026-09-30). The envelope must:
//   • emit ONLY the locked wire grammar (FIN-23/24; F-21 bare tokens)
//   • refuse unknown versions/shapes loudly (F-30: parse a field once)
//   • refuse free-text mode names — the FIN-23 registry is the only vocab
//   • never let a bad value reach the wire (readable error instead)
//   • stay PURE (no RN imports) — node vitest environment
// =====================================================================
import { describe, expect, it } from "vitest";
import {
  ENVELOPE_VERSION,
  decodeCommandEnvelope,
  encodeCommandEnvelope,
  jsonToWireLine,
} from "./commandEnvelope";

// Real builders from carProtocol (the ONE grammar) — the same deps the
// future gated wiring round would pass. No mocks: the tests pin the
// envelope against the actual protocol functions it must call.
import {
  buildCalibration,
  buildRouterCommand,
  buildServo,
  buildSpd,
  buildSteer,
  buildTrim,
  buildWifiConfigLine,
  canonicalCarToken,
  SPEED_MAX,
  SPEED_MIN,
} from "../services/carProtocol";

const deps = {
  buildSpd,
  buildServo,
  buildSteer,
  buildTrim,
  buildCalibration,
  buildRouterCommand,
  buildWifiConfigLine,
  canonicalCarToken,
  SPEED_MIN,
  SPEED_MAX,
};

describe("commandEnvelope — version + shape guards (F-30)", () => {
  it("rejects an unknown version instead of guessing", () => {
    const r = jsonToWireLine({ v: 99, type: "drive", dir: "F" }, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("version");
  });

  it("rejects a missing type", () => {
    const r = jsonToWireLine({ v: ENVELOPE_VERSION }, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("type");
  });

  it("rejects invalid JSON strings and non-object input", () => {
    expect(jsonToWireLine("{not json", deps).ok).toBe(false);
    expect(jsonToWireLine(42 as unknown as string, deps).ok).toBe(false);
  });

  it("decodes from both a JSON string and an object", () => {
    const asObject = decodeCommandEnvelope({
      v: ENVELOPE_VERSION,
      type: "drive",
      dir: "S",
    });
    expect(asObject.ok).toBe(true);
    const asString = decodeCommandEnvelope(
      JSON.stringify({ v: ENVELOPE_VERSION, type: "drive", dir: "S" }),
    );
    expect(asString.ok).toBe(true);
  });
});

describe("commandEnvelope — emits ONLY the locked wire grammar", () => {
  it("encodes drive letters verbatim (F|B|L|R|S)", () => {
    for (const dir of ["F", "B", "L", "R", "S"] as const) {
      const r = jsonToWireLine(
        { v: ENVELOPE_VERSION, type: "drive", dir },
        deps,
      );
      expect(r).toEqual({ ok: true, line: dir });
    }
  });

  it("refuses an invalid drive direction", () => {
    const r = jsonToWireLine(
      { v: ENVELOPE_VERSION, type: "drive", dir: "X" as "F" },
      deps,
    );
    expect(r.ok).toBe(false);
  });

  it("encodes speed via buildSpd and refuses out-of-window values", () => {
    expect(
      jsonToWireLine({ v: ENVELOPE_VERSION, type: "speed", value: 130 }, deps),
    ).toEqual({
      ok: true,
      line: "SPD130",
    });
    expect(
      jsonToWireLine({ v: ENVELOPE_VERSION, type: "speed", value: 42 }, deps)
        .ok,
    ).toBe(false);
    expect(
      jsonToWireLine({ v: ENVELOPE_VERSION, type: "speed", value: 300 }, deps)
        .ok,
    ).toBe(false);
  });

  it("encodes servo/steer/trim through the real builders with car-accepted ranges", () => {
    expect(
      jsonToWireLine({ v: ENVELOPE_VERSION, type: "servo", value: 90 }, deps),
    ).toEqual({
      ok: true,
      line: "SERVO90",
    });
    expect(
      jsonToWireLine(
        { v: ENVELOPE_VERSION, type: "steerLimit", value: 45 },
        deps,
      ),
    ).toEqual({
      ok: true,
      line: "STEER45",
    });
    expect(
      jsonToWireLine({ v: ENVELOPE_VERSION, type: "trim", value: -3 }, deps),
    ).toEqual({
      ok: true,
      line: "TRIM-3",
    });
    expect(
      jsonToWireLine({ v: ENVELOPE_VERSION, type: "trim", value: 91 }, deps).ok,
    ).toBe(false);
  });

  it("encodes estop + requestState to the exact protocol constants", () => {
    expect(
      jsonToWireLine({ v: ENVELOPE_VERSION, type: "estop" }, deps),
    ).toEqual({
      ok: true,
      line: "ESTOP",
    });
    expect(
      jsonToWireLine({ v: ENVELOPE_VERSION, type: "requestState" }, deps),
    ).toEqual({
      ok: true,
      line: "REQ_STATE",
    });
  });

  it("encodes mode as the BARE canonical token (F-21) and applies the ONE legacy alias", () => {
    expect(
      jsonToWireLine(
        { v: ENVELOPE_VERSION, type: "mode", token: "4WD4M" },
        deps,
      ),
    ).toEqual({
      ok: true,
      line: "4WD4M",
    });
    // Legacy BT alias canonicalizes to 4WD4M (X-8) — the only alias, by design.
    expect(
      jsonToWireLine({ v: ENVELOPE_VERSION, type: "mode", token: "BT" }, deps),
    ).toEqual({
      ok: true,
      line: "4WD4M",
    });
  });

  it("REFUSES the outside-AI brief's free-text mode name (FIN-23 registry is the only vocab)", () => {
    const r = jsonToWireLine(
      { v: ENVELOPE_VERSION, type: "mode", token: "obstacle_avoid" },
      deps,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not a fleet token");
  });

  it("encodes calibration and router/wifiConfig through the real builders", () => {
    expect(
      jsonToWireLine(
        {
          v: ENVELOPE_VERSION,
          type: "calibrate",
          pid: { kp: 12, ki: 3, kd: 1, out: 50, off: 0.75 },
        },
        deps,
      ),
    ).toEqual({
      ok: true,
      line: buildCalibration({ kp: 12, ki: 3, kd: 1, out: 50, off: 0.75 }),
    });
    expect(
      jsonToWireLine(
        { v: ENVELOPE_VERSION, type: "router", routerOp: "CLEAR" },
        deps,
      ),
    ).toEqual({ ok: true, line: "ROUTERS;CLEAR" });
    expect(
      jsonToWireLine(
        {
          v: ENVELOPE_VERSION,
          type: "router",
          routerOp: "ADD",
          ssid: "Home",
          pass: "hunter2",
        },
        deps,
      ),
    ).toEqual({ ok: true, line: "ROUTERS;ADD;Home;hunter2" });
    expect(
      jsonToWireLine(
        {
          v: ENVELOPE_VERSION,
          type: "wifiConfig",
          wifiSsid: "Home",
          wifiPass: "p",
        },
        deps,
      ),
    ).toEqual({ ok: true, line: "WIFICFG;Home;p" });
  });

  it("never emits a second grammar: every ok line matches the fleet wire shapes", () => {
    const lines = [
      { type: "drive", dir: "F" },
      { type: "speed", value: 150 },
      { type: "servo", value: 90 },
      { type: "steerLimit", value: 30 },
      { type: "trim", value: 5 },
      { type: "estop" },
      { type: "requestState" },
      { type: "mode", token: "AUTO" },
    ] as const;
    for (const env of lines) {
      const r = jsonToWireLine({ v: ENVELOPE_VERSION, ...env }, deps);
      expect(r.ok).toBe(true);
      if (r.ok) {
        // Fleet grammar = one line, semicolon-pairs or a single token/command.
        expect(r.line).not.toMatch(/"type"|"cmd"/);
        expect(r.line.length).toBeLessThan(80);
      }
    }
  });
});
