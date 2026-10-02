// Pins for the router-list normalisation — the D1 fix.
//
// D1 (owner: "the car not switching to next router"): the car deliberately
// puts its OWN AP first in the list, and the old UI did
// `Join "{carNetworks[0]}" now?` -> `ROUTERS;USE;<ownAp>` -> the firmware
// ERASED the stored credentials and reverted the car to its own AP.
//
// Every test here is a statement that the own AP can never be chosen.
import { describe, expect, it } from "vitest";

import {
  MAX_PASS_LEN,
  MAX_SSID_LEN,
  canAddRouter,
  defaultRouterSsid,
  isOwnApName,
  normalizeRouters,
  parseNetwLine,
  switchableRouters,
  validateRouterInput,
} from "./routerList";

const AP = "4WDCar_Wifi";

describe("D1 - the own AP is never a switch target", () => {
  it("a list that leads with the own AP offers the REAL router, not the AP", () => {
    // Exactly the shape the car sends: own AP first, then the saved routers.
    const entries = normalizeRouters([AP, "HomeNet", "OfficeNet"]);
    expect(entries[0]!.isOwnAp).toBe(true);
    expect(defaultRouterSsid(entries)).toBe("HomeNet");
    expect(switchableRouters(entries).map((e) => e.ssid)).toEqual([
      "HomeNet",
      "OfficeNet",
    ]);
  });

  it("the own AP alone yields NO switch target - never itself as a fallback", () => {
    const entries = normalizeRouters([AP]);
    expect(switchableRouters(entries)).toEqual([]);
    expect(defaultRouterSsid(entries)).toBeNull();
  });

  it("an empty list yields no default", () => {
    expect(defaultRouterSsid(normalizeRouters([]))).toBeNull();
    expect(defaultRouterSsid(normalizeRouters(["", "   ", null]))).toBeNull();
  });

  it("a car-reported own-AP name counts too, not just the registry", () => {
    const entries = normalizeRouters(["GenumLab_AP", "HomeNet"], {
      ownApName: "GenumLab_AP",
    });
    expect(entries[0]!.isOwnAp).toBe(true);
    expect(defaultRouterSsid(entries)).toBe("HomeNet");
  });

  it("marks the router the car has already joined, and prefers a different one", () => {
    const entries = normalizeRouters([AP, "HomeNet", "OfficeNet"], {
      activeSsid: "HomeNet",
    });
    expect(entries.find((e) => e.ssid === "HomeNet")!.isActive).toBe(true);
    // The active router is not what "switch to" offers first.
    expect(defaultRouterSsid(entries)).toBe("OfficeNet");
  });

  it("still names the only router when the car is already on it", () => {
    // Null here would make the UI say "no routers" about a car that has one.
    const entries = normalizeRouters([AP, "HomeNet"], {
      activeSsid: "HomeNet",
    });
    expect(defaultRouterSsid(entries)).toBe("HomeNet");
  });
});

describe("normalisation is total and de-duplicating", () => {
  it("drops blanks, nulls and whitespace", () => {
    expect(normalizeRouters(["", "  ", null, undefined]).length).toBe(0);
    expect(normalizeRouters(["  Home  "])[0]!.ssid).toBe("Home");
  });

  it("de-duplicates case-insensitively - one router is one row", () => {
    const entries = normalizeRouters(["Home", "home", "HOME"]);
    expect(entries.length).toBe(1);
    expect(entries[0]!.ssid).toBe("Home");
  });

  it("F-64: the own AP is matched case-insensitively", () => {
    expect(isOwnApName("4w dcar_wifi".replace(" ", ""))).toBe(true);
    expect(isOwnApName("4WDCAR_WIFI")).toBe(true);
    expect(isOwnApName("wirelesscar_wifi")).toBe(true);
    expect(isOwnApName("HomeNet")).toBe(false);
    expect(isOwnApName(null)).toBe(false);
    expect(
      normalizeRouters(["4w dcar_wifi".replace(" ", ""), "Home"])[0]!.isOwnAp,
    ).toBe(true);
  });

  it("stops offering an add once the car holds its maximum", () => {
    expect(canAddRouter(normalizeRouters([AP]))).toBe(true);
    expect(
      canAddRouter(normalizeRouters([AP, "a", "b", "c", "d", "e", "f"])),
    ).toBe(false);
  });
});

describe("D6 - the list arrives over Bluetooth too (the NETW; line)", () => {
  it("parses the NETW line the car sends on every STATE", () => {
    expect(parseNetwLine(`NETW;${AP};HomeNet;OfficeNet`)).toEqual([
      AP,
      "HomeNet",
      "OfficeNet",
    ]);
  });

  it("is case-insensitive on the verb and tolerant of spacing", () => {
    expect(parseNetwLine(`netw; ${AP} ; HomeNet `)).toEqual([AP, "HomeNet"]);
  });

  it("a line that is not NETW is null - never an empty list", () => {
    // A missing shape must not look like "the car has no routers".
    expect(parseNetwLine("STATE;MODE=BT")).toBeNull();
    expect(parseNetwLine("")).toBeNull();
  });

  it("the parsed line feeds straight into normalisation", () => {
    const names = parseNetwLine(`NETW;${AP};HomeNet`);
    expect(names).not.toBeNull();
    const entries = normalizeRouters(names ?? []);
    expect(defaultRouterSsid(entries)).toBe("HomeNet");
  });
});

describe("U3 - typed credentials are validated against the car's real caps", () => {
  it("accepts a normal router", () => {
    expect(validateRouterInput("HomeNet", "hunter2")).toEqual({ ok: true });
  });

  it("an empty name is refused with a readable reason", () => {
    const v = validateRouterInput("   ", "x");
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toMatch(/enter the router name/i);
  });

  it("the car's own network is refused as a router (this is D1's input side)", () => {
    const v = validateRouterInput(AP, "x");
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toMatch(/own network/i);
  });

  it("a car-reported own-AP name is refused too", () => {
    const v = validateRouterInput("GenumLab_AP", "x", {
      ownApName: "GenumLab_AP",
    });
    expect(v.ok).toBe(false);
  });

  it("the firmware's length caps are mirrored, not guessed", () => {
    const longName = "a".repeat(MAX_SSID_LEN + 1);
    const v1 = validateRouterInput(longName, "x");
    expect(v1.ok).toBe(false);
    expect(v1.ok === false && v1.reason).toContain(String(MAX_SSID_LEN));
    expect(validateRouterInput("a".repeat(MAX_SSID_LEN), "x").ok).toBe(true);

    const v2 = validateRouterInput("Home", "b".repeat(MAX_PASS_LEN + 1));
    expect(v2.ok).toBe(false);
    expect(v2.ok === false && v2.reason).toContain(String(MAX_PASS_LEN));
    expect(validateRouterInput("Home", "b".repeat(MAX_PASS_LEN)).ok).toBe(true);
  });

  it('a ";" in either field is refused - it separates commands on the car', () => {
    expect(validateRouterInput("Ho;me", "x").ok).toBe(false);
    expect(validateRouterInput("Home", "pa;ss").ok).toBe(false);
  });

  it("an open network is valid with an empty password", () => {
    expect(validateRouterInput("HomeNet", "").ok).toBe(true);
  });
});
