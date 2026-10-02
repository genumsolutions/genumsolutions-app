// Pins for the ONE place a dial address is produced — the D4 fix.
//
// D4 (owner: "the method switching was not working"): selecting the
// home-router method while disconnected blind-dialled ws://192.168.245.1:81
// - the car's OWN AP - because the flow's default map carried the AP address
// for the STA method. The phone dialled the hotspot it was supposed to have
// left, "verified", and every tile below it starved.
import { describe, expect, it } from "vitest";

import {
  CAR_AP_WS_URL,
  carIsOnOwnHotspot,
  carWebPageUrl,
  isCarApGateway,
  resolveDial,
} from "./dial";

const AP = "4WDCar_Wifi";

describe("the own-AP gateways are recognised, not guessed around", () => {
  it("knows both fleet gateways and nothing else", () => {
    expect(isCarApGateway("192.168.245.1")).toBe(true);
    expect(isCarApGateway("192.168.244.1")).toBe(true);
    expect(isCarApGateway("192.168.1.34")).toBe(false);
    expect(isCarApGateway("")).toBe(false);
    expect(isCarApGateway(null)).toBe(false);
  });

  it("recognises a gateway even when it arrives with a scheme or port", () => {
    expect(isCarApGateway("ws://192.168.245.1:81")).toBe(true);
  });
});

describe("car-hotspot - the one legitimate constant", () => {
  it("always resolves, because the car broadcasts this network", () => {
    const d = resolveDial({
      target: "car-hotspot",
      reportedIp: null,
      reportedSsid: null,
      ownApName: AP,
    });
    expect(d).not.toBeNull();
    expect(d!.url).toBe(CAR_AP_WS_URL);
    expect(d!.source).toBe("car-ap-constant");
  });

  it("prefers the address the car actually reports", () => {
    const d = resolveDial({
      target: "car-hotspot",
      reportedIp: "192.168.244.1",
      reportedSsid: AP,
      ownApName: AP,
    });
    expect(d!.url).toBe("ws://192.168.244.1:81");
    expect(d!.source).toBe("car-reported");
  });
});

describe("home-router - a reported address or NOTHING", () => {
  it("dials the address the car reported", () => {
    const d = resolveDial({
      target: "home-router",
      reportedIp: "192.168.1.34",
      reportedSsid: "HomeNet",
      ownApName: AP,
    });
    expect(d).toEqual({
      url: "ws://192.168.1.34:81",
      source: "car-reported",
      reportedIp: "192.168.1.34",
    });
  });

  it("REFUSES the car's own-AP gateway - the hotspot is never the router dial", () => {
    // This is the D4 defect, stated as a test.
    expect(
      resolveDial({
        target: "home-router",
        reportedIp: "192.168.245.1",
        reportedSsid: "HomeNet",
        ownApName: AP,
      }),
    ).toBeNull();
  });

  it("has no dial at all when the car has reported nothing", () => {
    expect(
      resolveDial({
        target: "home-router",
        reportedIp: null,
        reportedSsid: null,
        ownApName: AP,
      }),
    ).toBeNull();
  });

  it("has no dial when the reported value is not an address", () => {
    expect(
      resolveDial({
        target: "home-router",
        reportedIp: "   ",
        reportedSsid: "HomeNet",
        ownApName: AP,
      }),
    ).toBeNull();
  });

  it("strips a scheme the car reported rather than double-prefixing it", () => {
    const d = resolveDial({
      target: "home-router",
      reportedIp: "ws://192.168.1.34:81",
      reportedSsid: "HomeNet",
      ownApName: AP,
    });
    expect(d!.url).toBe("ws://192.168.1.34:81");
  });
});

describe("Bluetooth has no URL - it dials a MAC, not an address", () => {
  it("returns null so the URL path stays WiFi-only", () => {
    expect(
      resolveDial({
        target: "bt-spp",
        reportedIp: "192.168.1.34",
        reportedSsid: "HomeNet",
        ownApName: AP,
      }),
    ).toBeNull();
  });
});

describe("own-hotspot detection reads the car's SSID first", () => {
  it("matches the car-reported own-AP name", () => {
    expect(carIsOnOwnHotspot({ reportedSsid: AP, ownApName: AP })).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(
      carIsOnOwnHotspot({
        reportedSsid: "4w dcar_wifi".replace(" ", ""),
        ownApName: AP,
      }),
    ).toBe(true);
  });

  it("is false when the car names a real router", () => {
    expect(carIsOnOwnHotspot({ reportedSsid: "HomeNet", ownApName: AP })).toBe(
      false,
    );
  });

  it("is false - not a guess - when the car has said nothing", () => {
    expect(carIsOnOwnHotspot({ reportedSsid: null, ownApName: AP })).toBe(
      false,
    );
  });
});

describe("the car's web page is built from the same reported truth", () => {
  it("uses the reported address", () => {
    expect(carWebPageUrl("192.168.1.34")).toBe("http://192.168.1.34:80");
  });

  it("has no page when nothing was reported", () => {
    expect(carWebPageUrl(null)).toBeNull();
    expect(carWebPageUrl("  ")).toBeNull();
  });
});
