// Pins for the router-network discovery (U-74): the arithmetic and the
// "is this our car?" decision.
//
// The sweep exists because the app cannot resolve `genum-car.local` without a
// native module (a new APK), and because after the car joins a router its
// hotspot moves channel and the phone loses its only link. These tests are
// about the two things that must be right for that to be safe and useful:
//   - we only ever sweep a /24 the PHONE is actually on, and only private ranges;
//   - we only accept something that is recognisably OUR car, never "a host
//     answered", because routers, laptops and printers all answer on port 80.
import { describe, expect, it } from "vitest";

import {
  CAR_STATUS_URL,
  CAR_WS_URL,
  MAX_CANDIDATES,
  findCarOnNetwork,
  isPrivateIpv4,
  looksLikeOurCar,
  parseIpv4,
  subnetCandidates,
} from "./discovery";

describe("the phone's own address is read, not guessed", () => {
  it("parses a valid address and rejects nonsense", () => {
    expect(parseIpv4("192.168.1.37")).toEqual([192, 168, 1, 37]);
    expect(parseIpv4(" 10.0.0.5 ")).toEqual([10, 0, 0, 5]);
    expect(parseIpv4("192.168.1.256")).toBeNull();
    expect(parseIpv4("192.168.1")).toBeNull();
    expect(parseIpv4("not-an-ip")).toBeNull();
    expect(parseIpv4(null)).toBeNull();
    expect(parseIpv4("")).toBeNull();
  });

  it("only treats RFC1918 space as private", () => {
    expect(isPrivateIpv4([192, 168, 1, 5])).toBe(true);
    expect(isPrivateIpv4([10, 0, 0, 5])).toBe(true);
    expect(isPrivateIpv4([172, 16, 0, 5])).toBe(true);
    expect(isPrivateIpv4([172, 32, 0, 5])).toBe(false); // outside 172.16-31
    expect(isPrivateIpv4([8, 8, 8, 8])).toBe(false);
    expect(isPrivateIpv4([192, 169, 1, 5])).toBe(false); // link-local
  });
});

describe("the sweep is a bounded /24 on a PRIVATE network, or nothing", () => {
  it("sweeps the phone's own /24 and skips the phone itself", () => {
    const hosts = subnetCandidates("192.168.1.37");
    expect(hosts[0]).toBe("192.168.1.1");
    expect(hosts[hosts.length - 1]).toBe("192.168.1.254");
    expect(hosts).not.toContain("192.168.1.37");
    expect(hosts).toHaveLength(253);
  });

  it("never probes the network or broadcast address", () => {
    const hosts = subnetCandidates("192.168.1.37");
    expect(hosts).not.toContain("192.168.1.0");
    expect(hosts).not.toContain("192.168.1.255");
  });

  it("REFUSES to sweep on a public address, a VPN, or nothing", () => {
    // A phone on cellular or a VPN must never trigger a sweep of a public range.
    expect(subnetCandidates("8.8.8.8")).toEqual([]);
    expect(subnetCandidates("172.32.0.5")).toEqual([]);
    expect(subnetCandidates(null)).toEqual([]);
    expect(subnetCandidates("")).toEqual([]);
    expect(subnetCandidates("garbage")).toEqual([]);
  });

  it("never exceeds the hard cap, whatever the caller asks for", () => {
    expect(subnetCandidates("192.168.1.5", { max: 10 })).toHaveLength(10);
    expect(
      subnetCandidates("192.168.1.5", { max: 99_999 }).length,
    ).toBeLessThanOrEqual(MAX_CANDIDATES);
  });

  it("builds the car's real endpoints from a discovered host", () => {
    expect(CAR_STATUS_URL("192.168.1.50")).toBe(
      "http://192.168.1.50:80/status",
    );
    expect(CAR_WS_URL("192.168.1.50")).toBe("ws://192.168.1.50:81");
  });
});

describe("only something recognisably OUR car is accepted", () => {
  const carJson = {
    status: "Stopped",
    id: "A1B2C3",
    ap: "4WDCar_Wifi",
    ssid: "HomeNet",
    ip: "192.168.1.50",
  };

  it("accepts a match on the board id", () => {
    expect(looksLikeOurCar(carJson, { boardId: "a1b2c3" })).toBe(true);
    expect(looksLikeOurCar(carJson, { boardId: "A1B2C3" })).toBe(true);
  });

  it("accepts a match on the car's own AP name - the pre-pairing case", () => {
    // The phone has no profile for a car it has never seen, so the AP name is
    // what makes discovery work at all.
    expect(looksLikeOurCar(carJson, { apName: "4wdcar_wifi" })).toBe(true);
  });

  it("REJECTS a device that merely answered on port 80", () => {
    // Routers, laptops, printers and NAS boxes all answer HTTP.
    expect(
      looksLikeOurCar({ server: "nginx" }, { apName: "4WDCar_Wifi" }),
    ).toBe(false);
    expect(looksLikeOurCar({}, { apName: "4WDCar_Wifi" })).toBe(false);
    expect(looksLikeOurCar(null, { apName: "4WDCar_Wifi" })).toBe(false);
    expect(looksLikeOurCar("a string", { apName: "4WDCar_Wifi" })).toBe(false);
    expect(looksLikeOurCar(carJson, { apName: "SomeOtherAp" })).toBe(false);
  });

  it("rejects a car whose id is NOT ours when we know the id", () => {
    expect(
      looksLikeOurCar({ ...carJson, ap: "Other_AP" }, { boardId: "FFFFFF" }),
    ).toBe(false);
  });

  it("with no expectation at all, accepts nothing", () => {
    // Better to report "not found" than to dial whatever answered.
    expect(looksLikeOurCar(carJson)).toBe(false);
    expect(looksLikeOurCar(carJson, {})).toBe(false);
  });
});

describe("the sweep tolerates dead hosts and stops at the first hit", () => {
  const carJson = { id: "A1B2C3", ap: "4WDCar_Wifi" };

  it("finds the car and stops, ignoring every dead address", async () => {
    const probed: string[] = [];
    const hit = await findCarOnNetwork({
      candidates: Array.from({ length: 200 }, (_, i) => `192.168.1.${i + 1}`),
      expect: { apName: "4WDCar_Wifi" },
      concurrency: 8,
      fetchJson: async (url) => {
        probed.push(url);
        // Everything before .50 is a closed port - the normal majority.
        if (!url.includes("192.168.1.50")) throw new Error("ECONNREFUSED");
        return carJson;
      },
    });
    expect(hit).toBe("192.168.1.50");
    // It stopped early rather than probing all 200.
    expect(probed.length).toBeLessThan(200);
  });

  it("returns null when nothing on the network is our car", async () => {
    const hit = await findCarOnNetwork({
      candidates: ["192.168.1.1", "192.168.1.2"],
      expect: { apName: "4WDCar_Wifi" },
      fetchJson: async () => ({ server: "nginx" }),
    });
    expect(hit).toBeNull();
  });

  it("returns null - not a throw - when every host is unreachable", async () => {
    const hit = await findCarOnNetwork({
      candidates: ["192.168.1.1", "192.168.1.2", "192.168.1.3"],
      expect: { apName: "4WDCar_Wifi" },
      fetchJson: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(hit).toBeNull();
  });

  it("honours a cancelled sweep instead of hammering the network", async () => {
    let probes = 0;
    const signal = { aborted: false };
    const hit = await findCarOnNetwork({
      candidates: Array.from({ length: 100 }, (_, i) => `192.168.1.${i + 1}`),
      expect: { apName: "4WDCar_Wifi" },
      concurrency: 4,
      signal,
      fetchJson: async () => {
        probes++;
        signal.aborted = true; // the user navigated away on the first probe
        throw new Error("cancelled");
      },
    });
    expect(hit).toBeNull();
    expect(probes).toBeLessThan(100);
  });

  it("does nothing at all with no candidates", async () => {
    let probes = 0;
    const hit = await findCarOnNetwork({
      candidates: [],
      expect: { apName: "4WDCar_Wifi" },
      fetchJson: async () => {
        probes++;
        return carJson;
      },
    });
    expect(hit).toBeNull();
    expect(probes).toBe(0);
  });
});
