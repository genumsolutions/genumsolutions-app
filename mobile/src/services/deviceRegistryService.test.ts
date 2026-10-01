// =====================================================================
// deviceRegistryService tests - the guards against the fleet drifting
// into several different names for one device again.
//
// The failure this file exists to prevent (found 2026-10-01): a single
// 4WD4M was known by FOUR unrelated strings - repo folder
// (Genum_4WD4M_CAR), firmware FW_NAME ("4WD4M Car"), advertised
// Bluetooth/AP name ("4WD CAR" / "4WDCar_Wifi") and app catalogue
// ("4WD4M" + car label "4-wheel-drive") - with nothing asserting they
// described the same thing.
// =====================================================================
import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  BUNDLED_DEVICE_MODELS,
  pairingLabel,
  type DeviceModel,
} from "./deviceRegistryService";
import { resolveProfileKey } from "./carProfileService";

describe("BUNDLED_DEVICE_MODELS", () => {
  it("has unique model ids", () => {
    const ids = BUNDLED_DEVICE_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers the whole firmware fleet, including the two with no app mode", () => {
    const ids = BUNDLED_DEVICE_MODELS.map((m) => m.id);
    // wireless-car (fw 1.8.0) and smart-dustbin have firmware but had NO
    // entry in the app mode catalogue - they were invisible to the app.
    // They are here on purpose.
    expect(ids).toContain("wireless-car");
    expect(ids).toContain("smart-dustbin");
    expect(ids).toContain("remote-esp32");
  });

  it("points every model at a real repo folder name", () => {
    for (const m of BUNDLED_DEVICE_MODELS) {
      expect(m.repo, `${m.id} repo`).toMatch(/^Genum_[A-Z0-9_]+$/);
      expect(
        m.repo.endsWith("_CAR") ||
          m.repo.endsWith("_ESP32") ||
          m.repo.endsWith("_DUSTBIN"),
      ).toBe(true);
    }
  });

  it("records an advertised BT name where the firmware actually has one", () => {
    const byId = Object.fromEntries(
      BUNDLED_DEVICE_MODELS.map((m) => [m.id, m]),
    );
    // Verified against the firmware sources, not invented:
    //   BluetoothComm.cpp:13  -> SerialBT.begin("4WD CAR")
    //   Genum_REMOTE_ESP32    -> SerialBT.begin("REMOTE_CTRL")
    expect(byId["4wd4m"].btName).toBe("4WD CAR");
    expect(byId["remote-esp32"].btName).toBe("REMOTE_CTRL");
    expect(byId["wireless-car"].btName).toBe("WIRELESS CAR");
    expect(byId["2wd1m"].btName).toBe("2 WHEEL DRIVE CAR");
    expect(byId["self-balancing"].btName).toBe("SELF BALANCING BOT");
    expect(byId["smart-dustbin"].btName).toBeNull();
  });

  it("keeps the 4WD4M AP identity it actually advertises", () => {
    const m = BUNDLED_DEVICE_MODELS.find((x) => x.id === "4wd4m");
    expect(m?.apSsid).toBe("4WDCar_Wifi");
    expect(m?.apIp).toBe("192.168.245.1");
  });

  it("never silently derives the advertised name from the display name", () => {
    // The regression: someone 'fixes' the registry by setting btName from
    // displayName, which would rename the device and break every saved
    // pairing. Where a model has no advertised name it must stay null.
    //
    // Compared case-SENSITIVELY on purpose. A case-only difference is a
    // legitimate, real convention here - the firmware derives
    // "BT name = FW_NAME upper-cased" (R-17), so "Wireless Car" is
    // correctly announced as "WIRELESS CAR". Deriving the wrong way round
    // would produce an EXACT copy of the display name, which is what this
    // rule actually forbids.
    for (const m of BUNDLED_DEVICE_MODELS) {
      if (m.btName === null) continue;
      expect(
        m.btName,
        `${m.id}: advertised name must not be a copy of the display name`,
      ).not.toBe(m.displayName);
    }
  });

  it("keeps the upper-cased FW_NAME convention where the firmware uses it", () => {
    const byId = Object.fromEntries(
      BUNDLED_DEVICE_MODELS.map((m) => [m.id, m]),
    );
    // R-17 rule: advertised BT name = FW_NAME upper-cased. These three
    // follow it, and the registry must record the result verbatim.
    for (const id of ["2wd1m", "self-balancing", "wireless-car"]) {
      expect(byId[id].btName, `${id} follows the R-17 uppercase rule`).toBe(
        byId[id].fwName.toUpperCase(),
      );
    }
    // These two deviate on purpose and are frozen - documented, not fixed.
    expect(byId["4wd4m"].btName).not.toBe(byId["4wd4m"].fwName.toUpperCase());
    expect(byId["remote-esp32"].btName).not.toBe(
      byId["remote-esp32"].fwName.toUpperCase(),
    );
  });

  it("gives every model at least one transport and a version", () => {
    for (const m of BUNDLED_DEVICE_MODELS) {
      expect(m.transports.length, `${m.id} transports`).toBeGreaterThan(0);
      expect(m.fwVersion, `${m.id} fwVersion`).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});

describe("pairingLabel", () => {
  const model: DeviceModel = {
    id: "4wd4m",
    displayName: "4WD 4-Motor Car",
    repo: "Genum_4WD4M_CAR",
    fwName: "4WD4M Car",
    fwVersion: "1.0.0",
    btName: "4WD CAR",
    apSsid: "4WDCar_Wifi",
    apIp: "192.168.245.1",
    transports: ["classic-bt"],
  };

  it("shows the announced name when it differs from the app name", () => {
    // This is the whole point: the OS pairing list says "4WD CAR", so if the
    // app only said "4WD 4-Motor Car" the user cannot find their car.
    expect(pairingLabel(model)).toBe('4WD 4-Motor Car (pairs as "4WD CAR")');
  });

  it("does not repeat the name when they are the same", () => {
    expect(pairingLabel({ ...model, btName: "4WD 4-Motor Car" })).toBe(
      "4WD 4-Motor Car",
    );
  });

  it("is honest about an unknown unit", () => {
    expect(pairingLabel(null)).toBe("Unknown device");
  });
});

describe("device unique ids reuse the existing profile key rule", () => {
  it("prefers the firmware board id", () => {
    expect(resolveProfileKey({ fwId: "A1B2C3" })).toBe("fw:A1B2C3");
  });

  it("falls back to the Bluetooth MAC when there is no board id", () => {
    expect(resolveProfileKey({ btAddress: "AA:BB:CC:DD:EE:FF" })).toBe(
      "AA:BB:CC:DD:EE:FF",
    );
  });

  it("falls back to a Wi-Fi identity last", () => {
    expect(resolveProfileKey({ wifiIdentity: "4WDCar_Wifi" })).toBe(
      "wifi:4WDCar_Wifi",
    );
  });

  it("returns null when nothing is known, rather than inventing a key", () => {
    expect(resolveProfileKey({})).toBeNull();
  });
});

// ── ensureDevice goes through the register_device RPC ────────────────────
//
// This block exists because of a bug that made the whole garage feature
// dead on arrival. ensureDevice() used to upsert `devices` directly, but
// that table's INSERT policy is staff-only by design (the fleet table is
// shared, so a blanket user insert would let anyone claim any car). The
// upsert therefore failed RLS with 42501, the function returned
// { deviceId: null }, and no car was ever linked to its owner.
//
// The fix is the SECURITY DEFINER `register_device` RPC. These tests pin
// the call shape so nobody "simplifies" it back into a direct upsert.
const dbMocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const from = vi.fn();
  rpc.mockResolvedValue({ data: "dev-123", error: null });
  from.mockImplementation(() => {
    throw new Error(
      "ensureDevice must not write to `devices` directly - use register_device()",
    );
  });
  return { rpc, from };
});

vi.mock("../config/supabase", () => ({
  supabase: {
    rpc: (...a: unknown[]) => dbMocks.rpc(...a),
    from: (...a: unknown[]) => dbMocks.from(...a),
  },
  supabaseConfigured: true,
  googleWebClientId: "",
  googleConfigured: false,
}));

const { ensureDevice } = await import("./deviceRegistryService");

describe("ensureDevice claims a unit through the RPC", () => {
  beforeEach(() => {
    dbMocks.rpc.mockReset();
    dbMocks.rpc.mockResolvedValue({ data: "dev-123", error: null });
    dbMocks.from.mockClear();
  });

  it("calls register_device with the resolved profile key", async () => {
    const r = await ensureDevice("user-1", { fwId: "1FB608" }, "4wd4m");
    expect(dbMocks.rpc).toHaveBeenCalledTimes(1);
    expect(dbMocks.rpc).toHaveBeenCalledWith("register_device", {
      p_unique_id: "fw:1FB608",
      p_model_id: "4wd4m",
      p_fw_version: null,
    });
    expect(r).toEqual({ uniqueId: "fw:1FB608", deviceId: "dev-123" });
  });

  it("never writes to the shared devices table directly", async () => {
    // A direct upsert is what RLS rejected in the first place.
    await ensureDevice("user-1", { fwId: "1FB608" }, "4wd4m");
    expect(dbMocks.from).not.toHaveBeenCalled();
  });

  it("does not send a user id - the server derives the owner from the session", async () => {
    await ensureDevice("user-1", { fwId: "1FB608" }, "4wd4m");
    const args = dbMocks.rpc.mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(args).sort()).toEqual([
      "p_fw_version",
      "p_model_id",
      "p_unique_id",
    ]);
    expect(JSON.stringify(args)).not.toContain("user-1");
  });

  it("forwards a reported firmware version when the car gave one", async () => {
    await ensureDevice("user-1", { fwId: "1FB608" }, "4wd4m", "1.0.0");
    expect(dbMocks.rpc.mock.calls[0]![1]).toMatchObject({
      p_fw_version: "1.0.0",
    });
  });

  it("keeps the unique id when the claim fails, so the caller can log it", async () => {
    dbMocks.rpc.mockResolvedValue({ data: null, error: { message: "nope" } });
    const r = await ensureDevice("user-1", { fwId: "1FB608" }, "4wd4m");
    expect(r).toEqual({ uniqueId: "fw:1FB608", deviceId: null });
  });

  it("returns null when the identity resolves to nothing", async () => {
    // No board id, no MAC, no SSID: inventing a key here would silently
    // create a garbage device row.
    expect(await ensureDevice("user-1", {})).toBeNull();
    expect(dbMocks.rpc).not.toHaveBeenCalled();
  });
});
