// deviceProfileRegistryService.test.ts — the R4-7 user-hub device registry.
//
// Pins the union rules the hub depends on:
//   1. Cloud car_profiles + local deviceMemory merge into ONE list keyed by
//      profile_key, mirrored devices flagged, never duplicated.
//   2. Local-only devices (never mirrored) appear with source "local".
//   3. Cloud fields (name/routers) win on a mirrored device; local-only
//      identity (btIds) is preserved when the cloud row lacks it.
//   4. forgetDevice removes the local record + index entry (cloud delete
//      delegated to carProfileService).
//   5. pushLocalDevicesToCloud skips factory-fresh records (never invents
//      rows from a bare stub) and pushes meaningful local ones.
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── state lives inside vi.hoisted so the (hoisted) mock factories can
//    reference it ──
const mocks = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    getUser: vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>(
      async () => ({ data: { user: { id: "user-1" } } }),
    ),
    selectEqOrder: vi.fn<
      () => Promise<{ data: Array<Record<string, unknown>>; error: null }>
    >(async () => ({ data: [], error: null })),
    upsert: vi.fn(async () => ({ error: null })),
    del: vi.fn(async () => ({ error: null })),
  };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => mocks.store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      mocks.store.set(k, v);
    }),
    removeItem: vi.fn(async (k: string) => {
      mocks.store.delete(k);
    }),
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  default: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ order: mocks.selectEqOrder }),
      }),
      upsert: mocks.upsert,
      delete: () => ({ eq: () => ({ eq: () => mocks.del() }) }),
    }),
  }),
  createClient: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ order: mocks.selectEqOrder }),
      }),
      upsert: mocks.upsert,
      delete: () => ({ eq: () => ({ eq: () => mocks.del() }) }),
    }),
  }),
}));

import type { DevicePrefs } from "../components/tools/types";
// The REAL deviceMemory lives in components/tools/types.ts, which imports
// react-native (Flow — unparseable in the node test env). The service only
// needs its read/write contract, so this suite mocks the module with an
// in-memory twin backed by the same store the AsyncStorage mock uses.
vi.mock("../components/tools/types", () => ({
  devicePrefsKey: (address: string) => `genum.device.${address}`,
  deviceMemory: {
    read: async (address: string) => {
      const raw = mocks.store.get(`genum.device.${address}`);
      return raw ? (JSON.parse(raw) as DevicePrefs) : null;
    },
    write: async (address: string, prefs: DevicePrefs) => {
      mocks.store.set(`genum.device.${address}`, JSON.stringify(prefs));
    },
  },
}));
import {
  fetchKnownDevices,
  forgetDevice,
  rememberDeviceKey,
  pushLocalDevicesToCloud,
} from "./deviceProfileRegistryService";

// Test-side twin of the mocked deviceMemory (same store, same shape) for
// arranging records — the service under test uses the mocked module.
const localMemory = {
  write: async (address: string, prefs: DevicePrefs) => {
    mocks.store.set(`genum.device.${address}`, JSON.stringify(prefs));
  },
  read: async (address: string): Promise<DevicePrefs | null> => {
    const raw = mocks.store.get(`genum.device.${address}`);
    return raw ? (JSON.parse(raw) as DevicePrefs) : null;
  },
};

function prefs(over: Partial<DevicePrefs> = {}): DevicePrefs {
  return {
    address: "fw:AAAAAA",
    name: "Test car",
    modeId: null,
    speed: 170,
    servo: 90,
    steerLimit: 90,
    trim: 0,
    useJoystick: false,
    fullscreen: false,
    joystickLayout: "dual",
    lastWifiSsid: null,
    savedRouters: [],
    btIds: [],
    wifiHistory: [],
    uniqueId: null,
    savedAt: 1000,
    ...over,
  } as DevicePrefs;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.clear();
  mocks.selectEqOrder.mockImplementation(async () => ({
    data: [],
    error: null,
  }));
});

describe("fetchKnownDevices (the union)", () => {
  it("lists a local-only device from the registry index", async () => {
    await localMemory.write("fw:AAAAAA", prefs({ btIds: ["AA:11"] }));
    await rememberDeviceKey("fw:AAAAAA");
    const { devices, offline } = await fetchKnownDevices();
    expect(offline).toBe(false);
    expect(devices).toHaveLength(1);
    expect(devices[0]!.profileKey).toBe("fw:AAAAAA");
    expect(devices[0]!.source).toBe("local");
    expect(devices[0]!.mirrored).toBe(false);
    expect(devices[0]!.btIds).toEqual(["AA:11"]);
    expect(devices[0]!.name).toBe("Test car");
  });

  it("merges a cloud row + local record into one mirrored entry (no duplicates)", async () => {
    await localMemory.write("fw:BBBBBB", prefs({ name: "Local name" }));
    await rememberDeviceKey("fw:BBBBBB");
    mocks.selectEqOrder.mockImplementation(async () => ({
      data: [
        {
          profile_key: "fw:BBBBBB",
          car_name: "Cloud name",
          unique_id: "BBBBBB",
          settings: { speed: 200, saved_routers: ["Home"] },
          wifi_history: [],
          updated_at: "2026-09-30T00:00:00Z",
        },
      ],
      error: null,
    }));
    const { devices } = await fetchKnownDevices();
    expect(devices).toHaveLength(1);
    const d = devices[0]!;
    expect(d.mirrored).toBe(true);
    expect(d.name).toBe("Cloud name"); // cloud rename wins
    expect(d.savedRouters).toEqual(["Home"]);
    expect(d.settings?.speed).toBe(200);
  });

  it("keeps local-only btIds when the cloud row has none", async () => {
    await localMemory.write("fw:CCCCCC", prefs({ btIds: ["AA:22"] }));
    await rememberDeviceKey("fw:CCCCCC");
    mocks.selectEqOrder.mockImplementation(async () => ({
      data: [
        {
          profile_key: "fw:CCCCCC",
          car_name: "Cloudy",
          unique_id: "CCCCCC",
          settings: {},
          wifi_history: [],
          updated_at: "2026-09-30T00:00:00Z",
        },
      ],
      error: null,
    }));
    const { devices } = await fetchKnownDevices();
    expect(devices[0]!.btIds).toEqual(["AA:22"]);
  });

  it("lists a cloud-only device even with no local record", async () => {
    mocks.selectEqOrder.mockImplementation(async () => ({
      data: [
        {
          profile_key: "AA:BB:CC:DD:EE:FF",
          car_name: "BT car",
          unique_id: null,
          settings: {},
          wifi_history: [],
          updated_at: "2026-09-30T00:00:00Z",
        },
      ],
      error: null,
    }));
    const { devices } = await fetchKnownDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0]!.name).toBe("BT car");
    expect(devices[0]!.source).toBe("cloud");
  });

  it("falls back to the last-device spill when no prefs record exists yet", async () => {
    mocks.store.set(
      "genum.lastDevice",
      JSON.stringify({ address: "AA:99", name: "Fresh link" }),
    );
    const { devices } = await fetchKnownDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0]!.profileKey).toBe("AA:99");
  });

  it("sorts newest-first", async () => {
    await localMemory.write("fw:000001", prefs({ savedAt: 100 }));
    await rememberDeviceKey("fw:000001");
    await localMemory.write("fw:000002", prefs({ savedAt: 200 }));
    await rememberDeviceKey("fw:000002");
    const { devices } = await fetchKnownDevices();
    expect(devices.map((d) => d.profileKey)).toEqual([
      "fw:000002",
      "fw:000001",
    ]);
  });
});

describe("forgetDevice", () => {
  it("removes the local record and the index entry", async () => {
    await localMemory.write("fw:DDDDDD", prefs());
    await rememberDeviceKey("fw:DDDDDD");
    const before = await fetchKnownDevices();
    expect(before.devices).toHaveLength(1);
    await forgetDevice("fw:DDDDDD");
    const after = await fetchKnownDevices();
    expect(after.devices).toHaveLength(0);
    expect(await localMemory.read("fw:DDDDDD")).toBeNull();
  });
});

describe("pushLocalDevicesToCloud (offline-first spill)", () => {
  it("pushes meaningful local devices and skips factory-fresh stubs", async () => {
    await localMemory.write(
      "fw:111111",
      prefs({
        savedAt: 0,
        speed: 170,
        trim: 0,
        savedRouters: [],
        btIds: [],
        wifiHistory: [],
      }),
    );
    await rememberDeviceKey("fw:111111"); // fresh → skipped
    await localMemory.write(
      "fw:222222",
      prefs({ savedRouters: ["Home"], savedAt: 5000 }),
    );
    await rememberDeviceKey("fw:222222"); // meaningful → pushed
    const { pushed, offline } = await pushLocalDevicesToCloud();
    expect(offline).toBe(false);
    expect(pushed).toBe(1);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("does nothing offline", async () => {
    mocks.getUser.mockImplementationOnce(async () => ({
      data: { user: null },
    }));
    const { pushed, offline } = await pushLocalDevicesToCloud();
    expect(offline).toBe(true);
    expect(pushed).toBe(0);
  });
});
