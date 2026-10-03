// U-84 — the rules the unified Wi-Fi list depends on.
//
// These are pure list-shaping rules lifted out of the component so they can be
// tested without rendering. The point of the rewrite is that ONE list decides
// what is shown and what is switchable, so those two decisions are the contract.
import { describe, expect, it } from "vitest";

import {
  MAX_SAVED_ROUTERS,
  canAddRouter,
  isOwnApName,
  normalizeRouters,
  switchableRouters,
  type RouterEntry,
} from "./routerList";

/** The component's own ordering, mirrored here so the rules are testable. */
function shape(
  routers: readonly RouterEntry[],
  scanned: readonly { ssid: string }[] = [],
) {
  const seen = new Set<string>();
  const canSwitch = new Set(
    switchableRouters(routers as RouterEntry[]).map((r) => r.ssid),
  );
  const out: { ssid: string; state: string; switchable: boolean }[] = [];

  for (const r of routers) {
    if (seen.has(r.ssid) || !r.isActive) continue;
    seen.add(r.ssid);
    out.push({ ssid: r.ssid, state: "active", switchable: false });
  }
  for (const r of routers) {
    if (seen.has(r.ssid)) continue;
    seen.add(r.ssid);
    if (r.isOwnAp)
      out.push({ ssid: r.ssid, state: "hotspot", switchable: false });
    else if (canSwitch.has(r.ssid))
      out.push({ ssid: r.ssid, state: "saved", switchable: true });
  }
  for (const n of scanned) {
    if (seen.has(n.ssid)) continue;
    seen.add(n.ssid);
    out.push({ ssid: n.ssid, state: "nearby", switchable: false });
  }
  return out;
}

const entry = (
  ssid: string,
  isActive = false,
  isOwnAp = isOwnApName(ssid),
): RouterEntry => ({ ssid, isActive, isOwnAp });

describe("wifi list shape (U-84)", () => {
  it("puts the network the car is on first", () => {
    const rows = shape([
      entry("HomeNet"),
      entry("OfficeWiFi"),
      entry("nijandangal_2.4", true),
    ]);
    expect(rows[0]!.state).toBe("active");
    expect(rows[0]!.ssid).toBe("nijandangal_2.4");
  });

  it("shows the car's own hotspot as a normal row, not a separate section", () => {
    const rows = shape([entry("HomeNet"), entry("4WDCar_Wifi")]);
    const ap = rows.find((r) => r.ssid === "4WDCar_Wifi");
    expect(ap).toBeDefined();
    expect(ap!.state).toBe("hotspot");
    // Same list as everything else — no grouping, no separate heading.
    expect(rows.map((r) => r.ssid)).toContain("HomeNet");
  });

  it("never lets the car's own hotspot be a switch target (F-63)", () => {
    const rows = shape([entry("HomeNet"), entry("4WDCar_Wifi")]);
    expect(rows.find((r) => r.ssid === "4WDCar_Wifi")!.switchable).toBe(false);
    expect(rows.find((r) => r.ssid === "HomeNet")!.switchable).toBe(true);
  });

  it("lists a scanned network once, even when it is also saved", () => {
    const rows = shape(
      [entry("HomeNet")],
      [{ ssid: "HomeNet" }, { ssid: "Cafe" }],
    );
    expect(rows.filter((r) => r.ssid === "HomeNet")).toHaveLength(1);
    expect(rows.filter((r) => r.ssid === "Cafe")).toHaveLength(1);
  });

  it("does not offer a switch on a network that is only nearby", () => {
    const rows = shape([entry("HomeNet")], [{ ssid: "Cafe" }]);
    expect(rows.find((r) => r.ssid === "Cafe")!.switchable).toBe(false);
  });

  it("de-duplicates a network the car reports twice", () => {
    const rows = shape([entry("HomeNet"), entry("HomeNet", true)]);
    expect(rows.filter((r) => r.ssid === "HomeNet")).toHaveLength(1);
  });
});

describe("car truth (U-84)", () => {
  it("marks the network the car says it joined as active", () => {
    // The active SSID comes from the telemetry `ssid` field, not from the
    // NETW list - that is where the car reports it.
    const entries = normalizeRouters(["4WDCar_Wifi", "HomeNet"], {
      activeSsid: "HomeNet",
    });
    expect(entries.find((e) => e.ssid === "HomeNet")?.isActive).toBe(true);
    expect(entries.find((e) => e.ssid === "4WDCar_Wifi")?.isActive).toBe(false);
  });

  it("collapses a case-variant duplicate the car reported", () => {
    const entries = normalizeRouters(["HomeNet", "homenet"], {
      activeSsid: "HomeNet",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.isActive).toBe(true);
  });

  it("cannot save a network the car has no room for", () => {
    const full = Array.from({ length: MAX_SAVED_ROUTERS }, (_, i) =>
      entry(`r${i}`),
    );
    expect(canAddRouter(full)).toBe(false);
    expect(canAddRouter([entry("a")])).toBe(true);
  });
});
