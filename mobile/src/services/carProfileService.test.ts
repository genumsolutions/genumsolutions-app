import { beforeEach, describe, expect, it, vi } from "vitest";

// ── state lives inside vi.hoisted so the (hoisted) vi.mock factories can
// reference it (outer consts are in the temporal dead zone at mock setup). ──
const serviceMocks = vi.hoisted(() => {
  const getUser = vi.fn();
  const upsert = vi.fn();
  const del = vi.fn();
  const order = vi.fn();
  const createClient = vi.fn();
  getUser.mockImplementation(async () => ({
    data: { user: { id: "user-1" } },
  }));
  upsert.mockImplementation(async () => ({ error: null }));
  del.mockImplementation(async () => ({ error: null }));
  order.mockImplementation(async () => ({ data: [], error: null }));
  const client = {
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
    from: () => ({
      select: () => ({
        eq: () => ({ order: (...o: unknown[]) => order(...o) }),
      }),
      upsert: (...a: unknown[]) => upsert(...a),
      delete: () => ({ eq: () => ({ eq: () => del() }) }),
    }),
  };
  createClient.mockImplementation(() => client);
  return { getUser, upsert, del, order, createClient, client };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => {}),
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  default: (...a: unknown[]) => serviceMocks.createClient(...a),
  createClient: (...a: unknown[]) => serviceMocks.createClient(...a),
}));

import {
  resolveProfileKey,
  upsertWifiHistory,
  addBtId,
  toCloudRecord,
  fetchCarProfiles,
  saveCarProfile,
  deleteCarProfile,
  WIFI_HISTORY_CAP,
} from "./carProfileService";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveProfileKey", () => {
  it("prefers the firmware board id over BT and wifi identities", () => {
    expect(
      resolveProfileKey({
        fwId: "1A2B3C",
        btAddress: "AA:BB:CC",
        wifiIdentity: "Genum-AP-1A2B3C",
      }),
    ).toBe("fw:1A2B3C");
  });

  it("falls back to the BT MAC when no firmware id is present", () => {
    expect(resolveProfileKey({ fwId: null, btAddress: "AA:BB:CC" })).toBe(
      "AA:BB:CC",
    );
  });

  it("falls back to wifi:identity when there is no BT at all", () => {
    expect(
      resolveProfileKey({
        fwId: null,
        btAddress: null,
        wifiIdentity: "Genum-AP-1A2B3C",
      }),
    ).toBe("wifi:Genum-AP-1A2B3C");
  });

  it("trims and rejects empty identifiers", () => {
    expect(resolveProfileKey({ fwId: "  ", btAddress: " " })).toBeNull();
    expect(resolveProfileKey({ fwId: " A1B2C3 " })).toBe("fw:A1B2C3");
  });
});

describe("upsertWifiHistory", () => {
  it("inserts new newest-first with a timestamp", () => {
    const now = 1_700_000_000_000;
    const next = upsertWifiHistory(
      [{ ssid: "Home", lastSeen: now - 1000 }],
      "Cafe",
      now,
    );
    expect(next).toEqual([
      { ssid: "Cafe", lastSeen: now },
      { ssid: "Home", lastSeen: now - 1000 },
    ]);
  });

  it("dedupes by ssid and bumps lastSeen to the front", () => {
    const now = 1_700_000_000_000;
    let next = upsertWifiHistory(null, "Home", now - 2000);
    next = upsertWifiHistory(next, "Cafe", now - 1000);
    next = upsertWifiHistory(next, "Home", now);
    expect(next).toEqual([
      { ssid: "Home", lastSeen: now },
      { ssid: "Cafe", lastSeen: now - 1000 },
    ]);
  });

  it("caps history at the constant", () => {
    const start: Array<{ ssid: string; lastSeen: number }> = [];
    for (let i = 0; i < 60; i += 1) start.push({ ssid: `R${i}`, lastSeen: i });
    const next = upsertWifiHistory(start, "Fresh", 5_000);
    expect(next).toHaveLength(WIFI_HISTORY_CAP);
    expect(next[0].ssid).toBe("Fresh");
    expect(next[WIFI_HISTORY_CAP - 1].ssid).toBe("R48");
  });

  it("ignores gap / empty entries and drops invalid ones", () => {
    const dirty = [
      { ssid: "Ok", lastSeen: 1 },
      { ssid: "", lastSeen: 2 },
      null,
    ] as unknown as Array<{ ssid: string; lastSeen: number }>;
    const next = upsertWifiHistory(dirty, "New", 3);
    expect(next).toEqual([
      { ssid: "New", lastSeen: 3 },
      { ssid: "Ok", lastSeen: 1 },
    ]);
  });
});

describe("addBtId", () => {
  it("appends a new MAC once", () => {
    expect(addBtId(["AA:00:00:00:00:01"], "AA:00:00:00:00:02")).toEqual([
      "AA:00:00:00:00:01",
      "AA:00:00:00:00:02",
    ]);
  });

  it("never duplicates and ignores empty addresses", () => {
    const list = addBtId(["AA:00:00:00:00:01"], "AA:00:00:00:00:01");
    expect(list).toEqual(["AA:00:00:00:00:01"]);
    expect(addBtId(list, "")).toEqual(["AA:00:00:00:00:01"]);
  });

  it("caps the id list", () => {
    const many = Array.from(
      { length: 30 },
      (_, i) => `AA:00:00:00:00:${String(i).padStart(2, "0")}`,
    );
    const next = addBtId(many, "AA:00:00:00:00:FF");
    expect(next).toHaveLength(20);
    expect(next[next.length - 1]).toBe("AA:00:00:00:00:FF");
  });
});

describe("toCloudRecord", () => {
  it("maps local prefs to the cloud shape without secrets", () => {
    const prefs = {
      address: "fw:1A2B3C",
      name: "4WD4M",
      modeId: "2wd1m",
      speed: 120,
      servo: 90,
      steerLimit: 60,
      trim: 0,
      useJoystick: true,
      fullscreen: false,
      joystickLayout: "dual",
      lastWifiSsid: null,
      savedRouters: ["Home", "Office"],
      uniqueId: "1A2B3C",
      btIds: ["AA:00:00:00:00:01"],
      wifiHistory: [{ ssid: "Home", lastSeen: 1 }],
      lastWifiUrl: "ws://192.168.1.5:81",
      autoJoinRouter: true,
    } as never;
    const record = toCloudRecord(prefs, "fw:1A2B3C");
    expect(record.profile_key).toBe("fw:1A2B3C");
    expect(record.unique_id).toBe("1A2B3C");
    expect(record.car_name).toBe("4WD4M");
    expect(record.wifi_history).toEqual([{ ssid: "Home", lastSeen: 1 }]);
    expect(record.settings.auto_join_router).toBe(true);
    expect(record.settings.saved_routers).toEqual(["Home", "Office"]);
    expect(record.settings.bt_ids).toEqual(["AA:00:00:00:00:01"]);
    expect(record.updated_at).toBeTruthy();
  });
});

describe("cloud sync", () => {
  it("saveCarProfile upserts for a signed-in user and refreshes the cache", async () => {
    serviceMocks.order.mockResolvedValueOnce({
      data: [{ profile_key: "fw:1A2B3C" }],
      error: null,
    });
    const prefs = {
      address: "fw:1A2B3C",
      name: "4WD4M",
      modeId: null,
      speed: 0,
      servo: 0,
      steerLimit: 0,
      trim: 0,
      useJoystick: true,
      fullscreen: false,
      joystickLayout: "dual",
      lastWifiSsid: null,
      savedRouters: [],
      uniqueId: "1A2B3C",
    } as never;
    const res = await saveCarProfile(prefs, "fw:1A2B3C");
    expect(res.ok).toBe(true);
    expect(serviceMocks.upsert).toHaveBeenCalledTimes(1);
    expect(serviceMocks.upsert.mock.calls[0][0].profile_key).toBe("fw:1A2B3C");
  });

  it("saveCarProfile stays local when signed out (no network writes)", async () => {
    serviceMocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await saveCarProfile({} as never, "fw:zzz");
    expect(res.offline).toBe(true);
    expect(res.ok).toBe(false);
    expect(serviceMocks.upsert).not.toHaveBeenCalled();
  });

  it("fetchCarProfiles maps rows and reports online", async () => {
    serviceMocks.order.mockResolvedValueOnce({
      data: [
        {
          profile_key: "fw:1A2B3C",
          car_name: "4WD4M",
          unique_id: "1A2B3C",
          settings: { mode_id: "2wd1m" },
          wifi_history: [{ ssid: "Home", lastSeen: 1 }],
          updated_at: "2026-09-28T00:00:00Z",
        },
      ],
      error: null,
    });
    const { rows, offline } = await fetchCarProfiles();
    expect(offline).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0].settings.mode_id).toBe("2wd1m");
  });

  it("deleteCarProfile targets user_id + profile_key", async () => {
    const res = await deleteCarProfile("fw:1A2B3C");
    expect(res.ok).toBe(true);
    expect(serviceMocks.del).toHaveBeenCalledTimes(1);
  });
});
