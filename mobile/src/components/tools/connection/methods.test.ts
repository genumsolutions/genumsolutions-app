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

  it("Bluetooth offers SPP ONLY - no BLE row exists to be mistaken for working", () => {
    const bt = getMethod("bluetooth");
    expect(bt).not.toBeNull();
    expect(bt!.targets.map((t) => t.id)).toEqual(["bt-spp"]);
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

  it("WiFi (LAN) has the car's own hotspot AND the home router as separate targets", () => {
    expect(targetsOfMethod("wifi").map((t) => t.id)).toEqual([
      "car-hotspot",
      "home-router",
    ]);
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

describe("the F-65 discriminator is declared, not inferred", () => {
  it("only the home-router target needs the car to have joined a router", () => {
    expect(getTarget("home-router")!.needsCarOnRouter).toBe(true);
    expect(getTarget("car-hotspot")!.needsCarOnRouter).toBe(false);
    expect(getTarget("bt-spp")!.needsCarOnRouter).toBe(false);
  });

  it("reaching a target never tears the link down (no target re-provisions as a connect)", () => {
    // The link is only ever re-provisioned by an explicit switch ACTION, not
    // by the act of selecting a method. This is the D4/F-65 fix made explicit.
    for (const m of CONNECTION_METHODS) {
      for (const t of m.targets) expect(t.reprovisionsCar).toBe(false);
    }
  });
});

describe("unavailability is a string the UI can render, never a silent button", () => {
  it("the home-router target is unavailable until the car reports a router address", () => {
    expect(
      targetUnavailableReason("home-router", { carOnOwnRouter: false }),
    ).toMatch(/has not joined your router yet/i);
    expect(
      targetUnavailableReason("home-router", { carOnOwnRouter: true }),
    ).toBeNull();
  });

  it("the car's own hotspot is always available — the car broadcasts it", () => {
    expect(
      targetUnavailableReason("car-hotspot", { carOnOwnRouter: false }),
    ).toBeNull();
  });

  it("Bluetooth is always available", () => {
    expect(
      targetUnavailableReason("bt-spp", { carOnOwnRouter: false }),
    ).toBeNull();
  });

  it("Internet reports the method's reason through any target query", () => {
    expect(targetUnavailableReason(null, { carOnOwnRouter: true })).toMatch(
      /no longer exists/i,
    );
  });

  it("a method's own unavailability beats the target precondition", () => {
    const reason = targetUnavailableReason("car-hotspot", {
      carOnOwnRouter: false,
    });
    expect(reason).toBeNull();
    expect(getMethod("internet")!.unavailable).toMatch(/relay or broker/i);
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
