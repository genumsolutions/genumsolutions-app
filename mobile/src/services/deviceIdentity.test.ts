import { describe, expect, it } from "vitest";

import {
  groupProfilesByDevice,
  type IdentifiableProfile,
} from "./deviceIdentity";

function profile(over: Partial<IdentifiableProfile> = {}): IdentifiableProfile {
  return {
    profileKey: "fw:AAAAAA",
    carName: "4WD4M Car",
    uniqueId: "AAAAAA",
    settings: {},
    updatedAt: "2026-11-01T00:00:00Z",
    ...over,
  };
}

describe("groupProfilesByDevice", () => {
  it("collapses the same car's fw/BT/wifi keys into ONE device row", () => {
    const groups = groupProfilesByDevice([
      profile({ profileKey: "fw:AAAAAA", updatedAt: "2026-11-01T00:00:00Z" }),
      profile({
        profileKey: "AA:BB:CC:DD:EE:FF",
        updatedAt: "2026-11-03T00:00:00Z",
      }),
      profile({
        profileKey: "wifi:4WD4MCar_WiFi",
        updatedAt: "2026-10-01T00:00:00Z",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.deviceKey).toBe("fw:AAAAAA");
    expect(groups[0]!.profileKeys).toEqual([
      "AA:BB:CC:DD:EE:FF",
      "fw:AAAAAA",
      "wifi:4WD4MCar_WiFi",
    ]);
    // Newest row supplies the display name + settings.
    expect(groups[0]!.newest.profileKey).toBe("AA:BB:CC:DD:EE:FF");
  });

  it("does NOT merge rows that have no board id (they cannot be proven same)", () => {
    const groups = groupProfilesByDevice([
      profile({ profileKey: "AA:BB:CC:DD:EE:01", uniqueId: "" }),
      profile({ profileKey: "AA:BB:CC:DD:EE:02", uniqueId: "" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.uniqueId)).toEqual([null, null]);
  });

  it("reads the canonical project id from any row, newest first", () => {
    const [group] = groupProfilesByDevice([
      profile({
        settings: { project_id: "4wd4mcar" },
        updatedAt: "2026-11-03T00:00:00Z",
        profileKey: "fw:AAAAAA",
      }),
      profile({
        settings: {},
        updatedAt: "2026-11-04T00:00:00Z",
        profileKey: "AA:BB:CC:DD:EE:FF",
      }),
    ]);
    expect(group!.project).toBe("4wd4mcar");
    // …but the newest row is still the edit target.
    expect(group!.newest.profileKey).toBe("AA:BB:CC:DD:EE:FF");
  });

  it("orders devices newest-first and is deterministic", () => {
    const groups = groupProfilesByDevice([
      profile({
        uniqueId: "OLD",
        profileKey: "fw:OLD",
        updatedAt: "2026-10-01T00:00:00Z",
      }),
      profile({
        uniqueId: "NEW",
        profileKey: "fw:NEW",
        updatedAt: "2026-11-09T00:00:00Z",
      }),
    ]);
    expect(groups.map((g) => g.uniqueId)).toEqual(["NEW", "OLD"]);
  });

  it("survives an unparseable timestamp without dropping the row", () => {
    const groups = groupProfilesByDevice([
      profile({ updatedAt: "not-a-date" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe("4WD4M Car");
  });
});
