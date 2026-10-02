// =====================================================================
// staHandoff.test.ts — pins for the HOME-ROUTER HANDOFF (F-59).
//
// The bug these tests pin (owner report 2026-10-02: "the app is not
// switching the connection method to home router … and the car doesn't
// seem to initiate the switch"): the confirmed switch to `wifi-sta-ws`
// TORE THE LINK DOWN FIRST and then blind-dialled a default address.
// Two failures, one root cause:
//   1. The car can only join the router when SOMETHING tells it
//      (`ROUTERS;USE`) — and that command needs the live link that the
//      teardown just destroyed. So the car never moved.
//   2. The default dial only works when BOTH radios are already on the
//      router — which is exactly the state the switch was supposed to
//      CREATE. So the switch did nothing sensible.
//
// The correct shape is a HANDOFF: keep the link, send the car to the
// router, learn its new IP over that link, guide the phone over, then
// dial. staPhase() is the pure state machine for the card that guides
// it; staDialUrl() is the dial it ends with.
// =====================================================================
import { describe, expect, it } from "vitest";

import { staDialUrl, staPhase, type StaTelemetry } from "./staHandoff";

const AP_NAME = "4WDCar_Wifi";

describe("staPhase — the handoff state machine", () => {
  it("a car on its own AP starts the handoff at 'car-on-ap' (step 1: join a router)", () => {
    const t: StaTelemetry = {
      connected: false,
      ssid: AP_NAME,
      ip: "192.168.245.1",
    };
    expect(staPhase(t, AP_NAME)).toBe("car-on-ap");
  });

  it("no telemetry at all is still 'car-on-ap' — step 1 must show (fail open to guidance)", () => {
    const t: StaTelemetry = { connected: false, ssid: null, ip: null };
    expect(staPhase(t, AP_NAME)).toBe("car-on-ap");
  });

  it("a car that joined the router but has not reported an IP yet is 'joined' (step 1 done, step 2 waiting)", () => {
    const t: StaTelemetry = { connected: true, ssid: "Home", ip: null };
    expect(staPhase(t, AP_NAME)).toBe("joined");
  });

  it("a car on the router WITH an IP is 'ready' — the dial may be offered", () => {
    const t: StaTelemetry = {
      connected: true,
      ssid: "Home",
      ip: "192.168.1.34",
    };
    expect(staPhase(t, AP_NAME)).toBe("ready");
  });

  it("the car's OWN AP name never counts as 'joined' even if reported connected", () => {
    const t: StaTelemetry = {
      connected: true,
      ssid: AP_NAME,
      ip: "192.168.245.1",
    };
    expect(staPhase(t, AP_NAME)).toBe("car-on-ap");
  });

  it("case-insensitive own-AP match (car reports 4WDCAR_WIFI)", () => {
    const t: StaTelemetry = {
      connected: true,
      ssid: "4WDCAR_WIFI",
      ip: "192.168.245.1",
    };
    expect(staPhase(t, AP_NAME)).toBe("car-on-ap");
  });

  // ── car-dropped (owner report 2026-10-02 evening): the car RESET mid-
  // handoff (the unflashed cd3158f bug) and the card kept saying "this takes
  // a few seconds" forever. A link drop BEFORE the dial must flip the card
  // to an honest dropped state — never claim progress the car cannot make.
  describe("car-dropped — the link died mid-handoff", () => {
    it("a drop while the car is still on its own AP is 'car-dropped'", () => {
      const t: StaTelemetry = {
        connected: false,
        ssid: AP_NAME,
        ip: "192.168.245.1",
      };
      expect(staPhase(t, AP_NAME, false)).toBe("car-dropped");
    });

    it("a drop while joined-but-no-IP is 'car-dropped'", () => {
      const t: StaTelemetry = { connected: true, ssid: "Home", ip: null };
      expect(staPhase(t, AP_NAME, false)).toBe("car-dropped");
    });

    it("no truth at all + no link is 'car-dropped' (honest, not fake progress)", () => {
      const t: StaTelemetry = { connected: false, ssid: null, ip: null };
      expect(staPhase(t, AP_NAME, false)).toBe("car-dropped");
    });

    it("'ready' SURVIVES a link drop — the phone leaving the car's AP at step 3 is expected", () => {
      const t: StaTelemetry = {
        connected: true,
        ssid: "Home",
        ip: "192.168.1.34",
      };
      expect(staPhase(t, AP_NAME, false)).toBe("ready");
    });

    it("defaults to link-live — existing callers and tests need no change", () => {
      const t: StaTelemetry = {
        connected: false,
        ssid: AP_NAME,
        ip: "192.168.245.1",
      };
      expect(staPhase(t, AP_NAME)).toBe("car-on-ap");
    });
  });
});

describe("staDialUrl — the handoff's dial", () => {
  it("dials the car's reported router IP on the fleet WS port", () => {
    expect(staDialUrl("192.168.1.34")).toBe("ws://192.168.1.34:81");
  });

  it("keeps an explicit scheme the car reported", () => {
    expect(staDialUrl("ws://192.168.1.34:81")).toBe("ws://192.168.1.34:81");
  });

  it("no IP means no dial — the card must not dial a guessed address", () => {
    expect(staDialUrl(null)).toBeNull();
    expect(staDialUrl("")).toBeNull();
    expect(staDialUrl("   ")).toBeNull();
  });
});
