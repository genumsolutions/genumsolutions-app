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

import type { DevicePrefs } from "../components/tools/types";

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
  pickBestRouter,
  prefsFromCloudSettings,
  isFreshDefaultPrefs,
  mergeCloudProfile,
  sanitizeDiagnostics,
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
      lastRouterIp: null,
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

describe("pickBestRouter (smart-link)", () => {
  it("picks the STRONGEST saved router the car currently hears (scan)", () => {
    const best = pickBestRouter({
      saved: ["Home", "Office", "Cafe"],
      scan: [
        { ssid: "Office", rssi: -62 },
        { ssid: "Home", rssi: -45 },
        { ssid: "Cafe", rssi: -80 },
      ],
    });
    expect(best).toBe("Home");
  });

  it("never picks a router the car has not stored", () => {
    const best = pickBestRouter({
      saved: ["Home"],
      scan: [
        { ssid: "NeighborWifi", rssi: -30 },
        { ssid: "Home", rssi: -70 },
      ],
    });
    expect(best).toBe("Home");
  });

  it("uses recency to break rssi ties", () => {
    const best = pickBestRouter({
      saved: ["Office", "Home"],
      scan: [
        { ssid: "Home", rssi: -55 },
        { ssid: "Office", rssi: -55 },
      ],
      history: [{ ssid: "Office", lastSeen: 2 }],
      lastSsid: "Office",
    });
    expect(best).toBe("Office");
  });

  it("ignores hearable-but-unknowable strength and still prefers most recent", () => {
    const best = pickBestRouter({
      saved: ["Cafe", "Office"],
      scan: [{ ssid: "Office" }, { ssid: "Cafe" }],
      history: [{ ssid: "Cafe", lastSeen: 9 }],
    });
    expect(best).toBe("Cafe");
  });

  it("falls back to the most recently used saved router when nothing is heard", () => {
    const best = pickBestRouter({
      saved: ["Home", "Office"],
      scan: [],
      history: [{ ssid: "Home", lastSeen: 100 }],
      lastSsid: "Home",
    });
    expect(best).toBe("Home");
  });

  it("returns null when there is nowhere to join (stay on the car's AP)", () => {
    expect(pickBestRouter({ saved: [] })).toBeNull();
    expect(pickBestRouter({ saved: ["Home"], scan: [{ ssid: "Other" }] })).toBe(
      "Home",
    );
  });

  it("trims whitespace and tolerates null scan entries", () => {
    const best = pickBestRouter({
      saved: [" Home ", "Cafe"],
      scan: [{ ssid: "  Home  ", rssi: -40 }, null] as never,
      lastSsid: "Home",
    });
    expect(best).toBe("Home");
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
      lastRouterIp: null,
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

describe("profiles sync engine (last-saved-wins)", () => {
  const base = {
    name: null,
    modeId: null,
    speed: 170,
    servo: 90,
    steerLimit: 90,
    trim: 0,
    useJoystick: false,
    fullscreen: false,
    joystickLayout: "dual",
    lastWifiSsid: null,
    lastRouterIp: null,
    savedRouters: [],
  } as Omit<DevicePrefs, "address">;

  it("prefsFromCloudSettings sanitizes values and falls back to base", () => {
    const prefs = prefsFromCloudSettings(
      {
        mode_id: "2wd1m",
        speed: 200,
        trim: 5,
        saved_routers: ["Home", "Shop"],
        speed_bad: "nope",
      },
      base,
    );
    expect(prefs.modeId).toBe("2wd1m");
    expect(prefs.speed).toBe(200);
    expect(prefs.trim).toBe(5);
    expect(prefs.savedRouters).toEqual(["Home", "Shop"]);
  });

  it("prefsFromCloudSettings drops corrupt/foreign values", () => {
    const prefs = prefsFromCloudSettings(
      {
        mode_id: 42,
        speed: "fast",
        saved_routers: "not-an-array",
        bt_ids: [1, 2],
      },
      base,
    );
    expect(prefs.modeId).toBe(base.modeId);
    expect(prefs.speed).toBe(base.speed);
    expect(prefs.savedRouters).toEqual([]);
    expect(prefs.btIds).toEqual([]);
  });

  it("isFreshDefaultPrefs detects untouched local records", () => {
    expect(isFreshDefaultPrefs(null)).toBe(true);
    expect(isFreshDefaultPrefs({ ...base, address: null } as DevicePrefs)).toBe(
      true,
    );
    expect(
      isFreshDefaultPrefs({
        ...base,
        address: null,
        speed: 200,
      } as DevicePrefs),
    ).toBe(false);
    expect(
      isFreshDefaultPrefs({
        ...base,
        address: null,
        savedRouters: ["Home"],
      } as DevicePrefs),
    ).toBe(false);
  });

  it("mergeCloudProfile adopts cloud over a fresh local default and clamps", () => {
    const merged = mergeCloudProfile(
      {
        profile_key: "fw:1A2B3C",
        car_name: "Shop car",
        unique_id: "1A2B3C",
        settings: { mode_id: "4wd4m", speed: 900, trim: 500 },
        wifi_history: [],
        updated_at: "2026-09-29T00:00:00Z",
      },
      null,
      base,
    );
    expect(merged.source).toBe("cloud");
    expect(merged.changed).toBe(true);
    expect(merged.prefs.modeId).toBe("4wd4m");
    // Clamp into what the car accepts (linear 100..255).
    expect(merged.prefs.speed).toBe(255);
    expect(merged.prefs.trim).toBe(100);
    expect(merged.prefs.name).toBe("Shop car");
  });

  it("mergeCloudProfile keeps the local record when the local save is newer", () => {
    const local = {
      ...base,
      address: "fw:1A2B3C",
      speed: 130,
      savedAt: Date.parse("2026-09-29T10:00:00Z"),
    } as DevicePrefs;
    const merged = mergeCloudProfile(
      {
        profile_key: "fw:1A2B3C",
        car_name: "Older",
        unique_id: null,
        settings: { speed: 255 },
        wifi_history: [],
        updated_at: "2026-09-29T00:00:00Z",
      },
      local,
      base,
    );
    expect(merged.source).toBe("local");
    expect(merged.changed).toBe(false);
    expect(merged.prefs.speed).toBe(130);
  });

  it("mergeCloudProfile takes the newer cloud save and stamps its time", () => {
    const local = {
      ...base,
      address: "fw:1A2B3C",
      speed: 130,
      savedAt: Date.parse("2026-09-28T00:00:00Z"),
    } as DevicePrefs;
    const merged = mergeCloudProfile(
      {
        profile_key: "fw:1A2B3C",
        car_name: "Newer",
        unique_id: null,
        settings: { speed: 150, mode_id: "self-balancing" },
        wifi_history: [],
        updated_at: "2026-09-29T12:00:00Z",
      },
      local,
      base,
    );
    expect(merged.source).toBe("cloud");
    expect(merged.changed).toBe(true);
    expect(merged.prefs.speed).toBe(150);
    expect(merged.prefs.modeId).toBe("self-balancing");
    expect(merged.prefs.savedAt).toBe(Date.parse("2026-09-29T12:00:00Z"));
  });

  it("toCloudRecord mirrors the control style flag", () => {
    const record = toCloudRecord(
      {
        ...base,
        address: "fw:1A2B3C",
        useJoystick: true,
        joystickLayout: "single",
      } as DevicePrefs,
      "fw:1A2B3C",
    );
    expect(record.settings.use_joystick).toBe(true);
    expect(record.settings.joystick_layout).toBe("single");
  });
});

// =====================================================================
// R4-5 (2026-09-30): the last-used router joins the synced profile.
// Owner: "if the user changes things for the car, that car should also
// save all those things — profile, settings, data, presets."
// =====================================================================
describe("R4-5: last-used router sync", () => {
  const base = {
    name: null,
    modeId: null,
    speed: 170,
    servo: 90,
    steerLimit: 90,
    trim: 0,
    useJoystick: false,
    fullscreen: false,
    joystickLayout: "dual",
    lastWifiSsid: null,
    lastRouterIp: null,
    savedRouters: [],
  } as Omit<DevicePrefs, "address">;

  it("toCloudRecord carries last_wifi_ssid (name only, never passwords)", () => {
    const prefs = {
      address: "fw:1A2B3C",
      name: "4WD4M",
      modeId: null,
      speed: 170,
      servo: 90,
      steerLimit: 90,
      trim: 0,
      useJoystick: false,
      fullscreen: false,
      joystickLayout: "dual",
      lastWifiSsid: "HomeNet",
      savedRouters: ["HomeNet"],
      uniqueId: "1A2B3C",
      btIds: [],
      wifiHistory: [],
      lastWifiUrl: "ws://192.168.1.5:81",
      autoJoinRouter: true,
    } as never;
    const record = toCloudRecord(prefs, "fw:1A2B3C");
    expect(record.settings.last_wifi_ssid).toBe("HomeNet");
  });

  it("prefsFromCloudSettings restores last_wifi_ssid and last_wifi_url", () => {
    const prefs = prefsFromCloudSettings(
      {
        last_wifi_ssid: "HomeNet",
        last_wifi_url: "ws://192.168.1.5:81",
      },
      base,
    );
    expect(prefs.lastWifiSsid).toBe("HomeNet");
    expect(prefs.lastWifiUrl).toBe("ws://192.168.1.5:81");
  });

  it("prefsFromCloudSettings drops a corrupt last_wifi_ssid (forward-compatible)", () => {
    const prefs = prefsFromCloudSettings({ last_wifi_ssid: 42 }, base);
    expect(prefs.lastWifiSsid).toBeNull();
  });

  it("mergeCloudProfile carries the restored SSID/URL through adoption", () => {
    const merged = mergeCloudProfile(
      {
        profile_key: "fw:1A2B3C",
        car_name: "Shop car",
        unique_id: "1A2B3C",
        settings: {
          last_wifi_ssid: "HomeNet",
          last_wifi_url: "ws://192.168.1.5:81",
        },
        wifi_history: [],
        updated_at: "2026-09-30T00:00:00Z",
      },
      null,
      base,
    );
    expect(merged.source).toBe("cloud");
    expect(merged.changed).toBe(true);
    expect(merged.prefs.lastWifiSsid).toBe("HomeNet");
    expect(merged.prefs.lastWifiUrl).toBe("ws://192.168.1.5:81");
  });
});

// D1 (U-68): the own AP leads the car's list by design, and the app mirrors
// that list straight into savedRouters. So the auto-join's picker must be
// unable to return it - otherwise smart-link fires ROUTERS;USE;<ownAp> and
// the firmware erases the stored credentials and reverts the car to itself.
describe("pickBestRouter never returns the car's own network", () => {
  const AP = "4WDCar_Wifi";

  it("skips the own AP even when it is the only saved name", () => {
    expect(pickBestRouter({ saved: [AP] })).toBeNull();
  });

  it("skips the own AP and picks the real router instead", () => {
    // The own AP is first, exactly as the car reports it.
    expect(pickBestRouter({ saved: [AP, "HomeNet"] })).toBe("HomeNet");
  });

  it("skips it case-insensitively (F-64)", () => {
    expect(
      pickBestRouter({ saved: ["4w dcar_wifi".replace(" ", ""), "HomeNet"] }),
    ).toBe("HomeNet");
  });

  it("does not pick it on recency either - recency must not defeat the guard", () => {
    expect(
      pickBestRouter({
        saved: [AP, "HomeNet"],
        lastSsid: AP,
        history: [{ ssid: AP, lastSeen: 1 }],
      }),
    ).toBe("HomeNet");
  });

  it("does not pick it on scan strength either", () => {
    // The car's own AP is the strongest thing its antenna can hear - which is
    // exactly why a strength-based pick was the most dangerous path.
    expect(
      pickBestRouter({
        saved: [AP, "HomeNet"],
        scan: [
          { ssid: AP, rssi: -20 },
          { ssid: "HomeNet", rssi: -70 },
        ],
      }),
    ).toBe("HomeNet");
  });

  it("still picks a normal router when the own AP is absent", () => {
    expect(pickBestRouter({ saved: ["HomeNet"] })).toBe("HomeNet");
  });
});

// ---- U-97: the restart/diagnostics snapshot on the car profile ----

describe("diagnostics on the car profile", () => {
  const base = {
    name: "Car",
    modeId: null,
    speed: 0,
    servo: 90,
    steerLimit: 90,
    trim: 0,
    useJoystick: false,
    fullscreen: true,
    joystickLayout: "dual",
    lastWifiSsid: null,
    lastRouterIp: null,
    savedRouters: [],
  } as Omit<DevicePrefs, "address">;

  it("carries the diagnostics snapshot into the cloud settings", () => {
    const record = toCloudRecord(
      {
        address: "fw:1A2B3C",
        diagnostics: { crashCount: 3, resetReason: "TASK_WDT", at: "t" },
      } as DevicePrefs,
      "fw:1A2B3C",
    );
    expect(record.settings.diagnostics).toMatchObject({
      crashCount: 3,
      resetReason: "TASK_WDT",
    });
  });

  it("restores a valid snapshot from the cloud row", () => {
    const prefs = prefsFromCloudSettings(
      { diagnostics: { crashCount: 0, bootCount: 9 } },
      base,
    );
    expect(prefs.diagnostics).toMatchObject({ crashCount: 0, bootCount: 9 });
  });

  it("treats an empty or foreign snapshot as absent, never as a clean bill", () => {
    expect(sanitizeDiagnostics({})).toBeNull();
    expect(sanitizeDiagnostics("nonsense")).toBeNull();
    expect(sanitizeDiagnostics(null)).toBeNull();
    // Every value the wrong type -> nothing usable -> absent.
    expect(sanitizeDiagnostics({ crashCount: "3", resetReason: 7 })).toBeNull();
  });

  it("drops only the unusable fields of a partially corrupt snapshot", () => {
    expect(
      sanitizeDiagnostics({ crashCount: 2, resetReason: 42, at: "2026" }),
    ).toEqual({
      resetReason: null,
      bootCount: null,
      crashCount: 2,
      lastCrashPhase: null,
      lastCrashHeap: null,
      at: "2026",
    });
  });
});
