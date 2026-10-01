// =====================================================================
// transportPickerFlow.test.ts — pins for the CONFIRMED method switch.
//
// The bug these tests pin (found in the 2026-10-02 audit, OPS-1):
// `onConfirmSwitch` dialled the new method with the `url` STATE VARIABLE
// of the method being LEFT — a stale closure from the previous render.
// Switching Car-AP → home-router could therefore dial the car's AP
// address (ws://192.168.245.1:81) while the phone sat on the home
// router: a guaranteed connect failure that LOOKED like "the car is
// broken". One logical method must dial ITS OWN address (F-51's
// "one command means the same thing" rule, applied to addresses).
//
// The resolver is pure so CI can pin it without a device.
// =====================================================================
import { describe, expect, it } from "vitest";

import { DEFAULT_URL_BY_METHOD, planSwitch } from "./transportPickerFlow";

describe("planSwitch — the confirmed switch must dial the TARGET's address", () => {
  it("AP → home-router: plans the STA URL, never the AP default", () => {
    const plan = planSwitch({
      targetMethodId: "wifi-sta-ws",
      urlByTransport: { "wifi-sta-ws": "ws://192.168.1.34:81" },
    });
    expect(plan).toEqual({
      targetMethodId: "wifi-sta-ws",
      url: "ws://192.168.1.34:81",
    });
  });

  it("home-router → AP: plans the AP default, never the router's URL", () => {
    const plan = planSwitch({
      targetMethodId: "wifi-ap-ws",
      urlByTransport: { "wifi-sta-ws": "ws://192.168.1.34:81" },
    });
    expect(plan?.url).toBe(DEFAULT_URL_BY_METHOD["wifi-ap-ws"]);
  });

  it("a saved per-method URL survives the round trip (edit → away → back)", () => {
    const toSta = planSwitch({
      targetMethodId: "wifi-sta-ws",
      urlByTransport: {
        "wifi-sta-ws": "ws://192.168.1.50:81",
        "wifi-ap-ws": "ws://192.168.245.1:81",
      },
    });
    const backToAp = planSwitch({
      targetMethodId: "wifi-ap-ws",
      urlByTransport: {
        "wifi-sta-ws": toSta?.url ?? "",
        "wifi-ap-ws": "ws://192.168.245.1:81",
      },
    });
    expect(backToAp?.url).toBe("ws://192.168.245.1:81");
  });

  it("a URL-shaped method with no stored URL falls back to its default — never to another method's URL", () => {
    const plan = planSwitch({
      targetMethodId: "wifi-sta-ws",
      urlByTransport: { "wifi-ap-ws": "ws://10.0.0.5:81" },
    });
    expect(plan?.url).toBe(DEFAULT_URL_BY_METHOD["wifi-sta-ws"]);
    expect(plan?.url).not.toBe("ws://10.0.0.5:81");
  });

  it("AP → Bluetooth (scan-based): null URL — a scan method has no address to dial", () => {
    const plan = planSwitch({
      targetMethodId: "bt-classic",
      urlByTransport: { "wifi-ap-ws": "ws://192.168.245.1:81" },
      scanBased: true,
    });
    expect(plan).toEqual({ targetMethodId: "bt-classic", url: null });
  });

  it("AP → HTTP: plans the HTTP address shape", () => {
    const plan = planSwitch({
      targetMethodId: "http",
      urlByTransport: {},
    });
    expect(plan?.url).toBe(DEFAULT_URL_BY_METHOD.http);
  });

  it("an unknown method id resolves to no dial at all (fails closed)", () => {
    const plan = planSwitch({
      targetMethodId: "not-a-method" as never,
      urlByTransport: {},
    });
    expect(plan).toBeNull();
  });
});
