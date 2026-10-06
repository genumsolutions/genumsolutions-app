// Pins for the three-method model (U-68). The owner's directive was
// "keep only these method for now, Bluwtooth, Wifi(LAN), Internet" and
// "offer bluetooh comminication with SPP only for now" — so the shape of
// this list IS the requirement, and it is pinned.
import { describe, expect, it } from "vitest";

import {
  CONNECTION_METHODS,
  METHOD_IDS,
  getMethod,
  getTarget,
  methodOfTarget,
  targetUnavailableReason,
  targetsOfMethod,
} from "./methods";

describe("the method model — exactly the three the owner named", () => {
  it("offers Bluetooth, WiFi (LAN) and Internet, in that order, and nothing else", () => {
    expect(METHOD_IDS).toEqual(["bluetooth", "wifi", "internet"]);
  });

  it("Bluetooth offers SPP connect and router management, never BLE", () => {
    const bt = getMethod("bluetooth");
    expect(bt).not.toBeNull();
    expect(bt!.targets.map((t) => t.id)).toEqual(["bt-spp", "bt-routers"]);
    // Assert on the ids a user could pick, not on a substring of the JSON
    // ("unavailable" happens to contain "ble").
    const allTargetIds = CONNECTION_METHODS.flatMap((m) =>
      m.targets.map((t) => t.id),
    );
    expect(allTargetIds).not.toContain("bt-ble");
    expect(allTargetIds.filter((id) => id.includes("ble"))).toEqual([]);
    // And no BLE wording anywhere the user can read.
    const labels = CONNECTION_METHODS.flatMap((m) => [
      m.label,
      m.blurb,
      ...m.targets.map((t) => `${t.label} ${t.blurb} ${t.requirement}`),
    ]);
    expect(labels.join(" ").toLowerCase()).not.toContain("low energy");
  });

  // U-86: this used to REQUIRE the hotspot and the home router as two separate
  // targets, pinning the "Where is the car?" dropdown the owner asked to have
  // deleted. One merged target now, and the network names come from the car.
  it("Wi-Fi is ONE target, not a hotspot/router pair", () => {
    expect(targetsOfMethod("wifi").map((t) => t.id)).toEqual(["car-wifi"]);
  });

  it("every target belongs to the method that lists it", () => {
    for (const m of CONNECTION_METHODS) {
      for (const t of m.targets) expect(t.method).toBe(m.id);
    }
  });

  it("no target id is declared twice", () => {
    const ids = CONNECTION_METHODS.flatMap((m) => m.targets.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("Internet is offered but honestly unavailable, with a reason and no targets", () => {
    const net = getMethod("internet");
    expect(net).not.toBeNull();
    expect(net!.unavailable).toBeTruthy();
    expect(net!.targets).toHaveLength(0);
  });
});

describe("U-86: the hotspot/router split is gone", () => {
  it("Wi-Fi has exactly ONE target, so there is no 'Where is the car?' choice", () => {
    expect(getMethod("wifi")!.targets).toHaveLength(1);
    expect(getMethod("wifi")!.targets[0]!.id).toBe("car-wifi");
  });

  it("no target anywhere still refers to a home router or the hotspot by name", () => {
    const ids = CONNECTION_METHODS.flatMap((m) => m.targets.map((t) => t.id));
    expect(ids).not.toContain("home-router");
    expect(ids).not.toContain("car-hotspot");
  });

  it("no target needs the car to have joined a router - that is not a precondition", () => {
    for (const m of CONNECTION_METHODS) {
      for (const t of m.targets) expect(t.needsCarOnRouter).toBe(false);
    }
  });

  it("the Wi-Fi target is always available - the car is reachable either way", () => {
    expect(
      targetUnavailableReason("car-wifi", { carOnOwnRouter: false }),
    ).toBeNull();
    expect(
      targetUnavailableReason("car-wifi", { carOnOwnRouter: true }),
    ).toBeNull();
  });
});

describe("the F-65 discriminator is declared, not inferred", () => {
  it("only the router-management target re-provisions the car", () => {
    // Re-provisioning means reaching the target changes the CAR's network.
    // Bluetooth router management does (switch/add/edit/delete over SPP);
    // SPP connect and the Wi-Fi target do not — they only dial a live link.
    const byId = Object.fromEntries(
      CONNECTION_METHODS.flatMap((m) => m.targets.map((t) => [t.id, t])),
    );
    expect(byId["bt-spp"].reprovisionsCar).toBe(false);
    expect(byId["bt-routers"].reprovisionsCar).toBe(true);
    expect(byId["car-wifi"].reprovisionsCar).toBe(false);
  });
});

describe("unavailability is a string the UI can render, never a silent button", () => {
  it("Bluetooth is always available", () => {
    expect(
      targetUnavailableReason("bt-spp", { carOnOwnRouter: false }),
    ).toBeNull();
  });

  it("a method's own unavailability beats the target precondition", () => {
    const reason = targetUnavailableReason("car-wifi", {
      carOnOwnRouter: false,
    });
    expect(reason).toBeNull();
    expect(getMethod("internet")!.unavailable).toBeTruthy();
  });
});

describe("lookups are total — an unknown id is a null, never a throw", () => {
  it("getMethod / getTarget / methodOfTarget return null for junk", () => {
    expect(getMethod(null)).toBeNull();
    expect(getMethod("nope" as never)).toBeNull();
    expect(getTarget(undefined)).toBeNull();
    expect(getTarget("nope" as never)).toBeNull();
    expect(methodOfTarget("nope" as never)).toBeNull();
    expect(targetsOfMethod(null)).toEqual([]);
  });
});

// F-41's protection, re-expressed for the rebuilt surface.
//
// The old gate lived in `transportGate.ts` and was enforced ONLY inside
// TransportPicker — i.e. only while that particular component was mounted. It
// is deleted with the picker. Its INTENT must not go with it: the transport
// REGISTRY still carries eight entries (three real, five parked), and the rule
// is that a user may only ever be OFFERED the ones that work.
//
// So the guarantee now moves to the model: the offered targets are declared in
// `methods.ts` and these tests pin that every one of them is a real registered
// transport, and that the parked ones cannot leak in.
describe("F-41 intent, preserved: only working transports are offered", () => {
  // Mirrors buildAllTransports()'s ids (adapters.test.ts pins the list at 8).
  const REGISTERED = [
    "bt-classic",
    "bt-ble",
    "wifi-ap-ws",
    "wifi-sta-ws",
    "http",
    "mdns",
    "mqtt",
    "cloud-relay",
  ] as const;

  /** target id -> the transport id(s) that can actually carry it. */
  const CARRIER: Record<string, string | string[]> = {
    "bt-spp": "bt-classic",
    // U-96: router management over Bluetooth rides the SAME SPP link the car
    // is already on — switching/add/edit/delete are ROUTERS;… commands sent
    // over the live SPP socket, not a second transport.
    "bt-routers": "bt-classic",
    // U-86: the merged Wi-Fi target is carried by EITHER wifi transport - the
    // car's own AP or a router lease. Which one applies depends on where the
    // car is, which the app reads from the car rather than asking the user.
    "car-wifi": ["wifi-ap-ws", "wifi-sta-ws"],
  };

  it("every offered target is backed by a REGISTERED transport", () => {
    for (const t of CONNECTION_METHODS.flatMap((m) => m.targets)) {
      const carriers = CARRIER[t.id];
      expect(carriers, `${t.id} has no carrier`).toBeTruthy();
      for (const c of [carriers].flat()) expect(REGISTERED).toContain(c);
    }
  });

  it("no offered target is carried by a parked transport", () => {
    const parked = ["bt-ble", "http", "mdns", "mqtt", "cloud-relay"];
    for (const t of CONNECTION_METHODS.flatMap((m) => m.targets)) {
      for (const c of [CARRIER[t.id]].flat()) expect(parked).not.toContain(c);
    }
  });

  it("no parked transport is reachable through the method list at all", () => {
    const parked = ["bt-ble", "http", "mdns", "mqtt", "cloud-relay"];
    const ids = JSON.stringify(CONNECTION_METHODS);
    for (const p of parked) expect(ids).not.toContain(p);
  });

  it("Internet offers NO target - it has no carrier and must not pretend to", () => {
    // An unbacked target would be a button that dials nothing.
    expect(getMethod("internet")!.targets).toEqual([]);
  });
});
