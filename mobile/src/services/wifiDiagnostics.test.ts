import { afterEach, describe, expect, it } from "vitest";

import {
  __setNetInfoForTests,
  diagnose,
  getNetworkSnapshot,
  type HttpProbeResult,
  type NetworkSnapshot,
} from "./wifiDiagnostics";

function snapshot(over: Partial<NetworkSnapshot> = {}): NetworkSnapshot {
  return {
    type: "wifi",
    isConnected: true,
    isInternetReachable: false, // the car's AP has no upstream — normal
    ip: "192.168.245.23",
    ssid: "4WDCar_Wifi",
    onCarAp: true,
    onCarSubnet: true,
    ...over,
  };
}

function probe(over: Partial<HttpProbeResult> = {}): HttpProbeResult {
  return {
    url: "http://192.168.245.1/",
    ok: true,
    status: 200,
    ms: 12,
    error: null,
    bodyHead: "<html>GENUM 4WD Car</html>",
    ...over,
  };
}

const ids = (r: ReturnType<typeof diagnose>) => r.verdicts.map((v) => v.id);
const verdict = (r: ReturnType<typeof diagnose>, id: string) =>
  r.verdicts.find((v) => v.id === id);

afterEach(() => __setNetInfoForTests(null));

describe("diagnose", () => {
  it("passes when the phone is on the car AP and the link is verified", () => {
    const r = diagnose({
      network: snapshot(),
      probe: probe(),
      link: {
        url: "ws://192.168.245.1:81",
        isConnected: true,
        linkVerified: true,
        lastError: null,
      },
    });
    expect(r.healthy).toBe(true);
    expect(ids(r)).toContain("probe-ok");
    expect(ids(r)).toContain("link-verified");
    expect(r.summary).toMatch(/connected/i);
  });

  it("flags a phone that never joined the car's WiFi", () => {
    const r = diagnose({
      network: snapshot({
        onCarAp: false,
        onCarSubnet: false,
        ssid: "HomeNet",
        ip: "192.168.1.44",
      }),
      probe: probe({
        ok: false,
        status: null,
        error: "Network request failed",
      }),
    });
    expect(r.healthy).toBe(false);
    expect(verdict(r, "not-car-ap")?.severity).toBe("fail");
    // Reaching the wrong-network failure is the ACTIONABLE one, not a
    // generic "car unreachable" complaint.
    expect(ids(r)).toContain("not-car-ap");
  });

  it("blames mobile data when the phone is on cellular", () => {
    const r = diagnose({
      network: snapshot({ type: "cellular", onCarAp: false, ssid: null }),
      probe: probe({ ok: false, status: null }),
    });
    expect(verdict(r, "on-cellular")?.severity).toBe("fail");
  });

  it("names the app-vs-firmware ambiguity when the car is silent on its own AP", () => {
    const r = diagnose({
      network: snapshot(),
      probe: probe({
        ok: false,
        status: null,
        error: "Network request failed",
      }),
    });
    const v = verdict(r, "probe-blocked");
    expect(v?.severity).toBe("fail");
    // The fix MUST offer the browser test that isolates firmware from app.
    expect(v?.fix).toMatch(/browser/i);
  });

  it("reports a socket that opened but never heard from the car", () => {
    const r = diagnose({
      network: snapshot(),
      probe: probe(),
      link: {
        url: "ws://192.168.245.1:81",
        isConnected: true,
        linkVerified: false,
        lastError: null,
      },
    });
    expect(verdict(r, "link-open-silent")?.severity).toBe("fail");
    expect(r.healthy).toBe(false);
  });

  it("does NOT fault the car for having no upstream internet", () => {
    // Regression guard: the softAP is offline by design, so
    // isInternetReachable:false must never be reported as a problem.
    const r = diagnose({
      network: snapshot({ isInternetReachable: false }),
      probe: probe(),
      link: {
        url: "ws://192.168.245.1:81",
        isConnected: true,
        linkVerified: true,
        lastError: null,
      },
    });
    expect(r.healthy).toBe(true);
    expect(ids(r)).not.toContain("no-internet");
  });

  it("warns when on the car's subnet but a different network", () => {
    const r = diagnose({
      network: snapshot({
        onCarAp: false,
        onCarSubnet: true,
        ssid: "HomeNet",
        ip: "192.168.245.9",
      }),
      probe: probe(),
    });
    expect(verdict(r, "car-subnet")?.severity).toBe("warn");
  });
});

describe("getNetworkSnapshot", () => {
  it("treats Android's withheld SSID placeholder as unknown", async () => {
    __setNetInfoForTests({
      fetch: async () => ({
        type: "wifi",
        isConnected: true,
        isInternetReachable: false,
        details: { ipAddress: "192.168.245.5", ssid: "<unknown ssid>" },
      }),
    });
    const s = await getNetworkSnapshot();
    expect(s.ssid).toBeNull();
    expect(s.onCarAp).toBe(false);
    // The subnet check must still work without a name.
    expect(s.onCarSubnet).toBe(true);
  });

  it("degrades to an empty snapshot when NetInfo is unavailable", async () => {
    const s = await getNetworkSnapshot();
    expect(s.type).toBeNull();
    expect(s.onCarSubnet).toBe(false);
  });

  it("detects the car AP by name", async () => {
    __setNetInfoForTests({
      fetch: async () => ({
        type: "wifi",
        isConnected: true,
        isInternetReachable: false,
        details: { ipAddress: "192.168.245.31", ssid: "4WDCar_Wifi" },
      }),
    });
    const s = await getNetworkSnapshot();
    expect(s.onCarAp).toBe(true);
  });
});
