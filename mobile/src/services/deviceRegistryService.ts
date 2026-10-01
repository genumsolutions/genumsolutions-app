// =====================================================================
// deviceRegistryService - the shared device/model registry.
//
// Owner decision 2026-10-01: MODEL metadata is canonical in the repo
// (guide/DEVICE-REGISTRY.json, applied to the shared `device_models`
// table); each PHYSICAL UNIT's display name lives in the database. This
// is the app-side reader for both, so the app, the website and the
// firmware stop disagreeing about what a car is called.
//
// Two rules that are deliberately NOT negotiable here:
//
// 1. `advertised.btName` is FROZEN. It is what the firmware announces
//    over Bluetooth and what the OS shows on the pairing screen. It is
//    recorded so the user can match a car to its entry, never to
//    re-advertise a different name. Renaming breaks saved pairings and
//    every stored car_profiles.profile_key.
//
// 2. The model registry and the MODE catalogue are different things.
//    Modes ("Obstacle Avoidance - IR") are operational states a car can
//    be in and live in `robo_car_modes` (see carModeService). Models
//    ("4WD 4-Motor Car") are physical product lines and live here.
//    Conflating them is how the fleet ended up with four names for one
//    device.
//
// Bundled BUNDLED_DEVICE_MODELS is the offline fallback, matching the
// carModeService pattern: DB first, bundled when Supabase is unreachable.
// =====================================================================
import { supabase, supabaseConfigured } from "../config/supabase";
import {
  resolveProfileKey,
  type CarProfileIdentity,
} from "./carProfileService";

export type DeviceTransport =
  | "classic-bt"
  | "ble"
  | "wifi"
  | "wifi-ap"
  | "wifi-sta"
  | "http"
  | "websocket"
  | "rf"
  | "wifi-ap-ota";

export type DeviceModel = {
  id: string;
  displayName: string;
  repo: string;
  /** Firmware's own FW_NAME, e.g. "4WD4M Car". */
  fwName: string;
  fwVersion: string;
  /** FROZEN advertised Bluetooth name. What the OS pairing screen shows. */
  btName: string | null;
  /** FROZEN advertised Wi-Fi AP SSID, when the model has one. */
  apSsid: string | null;
  apIp: string | null;
  transports: DeviceTransport[];
};

/** Mirrors guide/DEVICE-REGISTRY.json. Keep the two in step. */
export const BUNDLED_DEVICE_MODELS: DeviceModel[] = [
  {
    id: "4wd4m",
    displayName: "4WD 4-Motor Car",
    repo: "Genum_4WD4M_CAR",
    fwName: "4WD4M Car",
    fwVersion: "1.0.0",
    btName: "4WD CAR",
    apSsid: "4WDCar_Wifi",
    apIp: "192.168.245.1",
    transports: ["classic-bt", "wifi-ap", "wifi-sta", "http", "websocket"],
  },
  {
    id: "2wd1m",
    displayName: "2WD + Servo Car (1 Motor)",
    repo: "Genum_2WD1M_CAR",
    fwName: "2 Wheel Drive Car",
    fwVersion: "1.0.4",
    btName: "2 WHEEL DRIVE CAR",
    apSsid: null,
    apIp: null,
    transports: ["classic-bt"],
  },
  {
    id: "self-balancing",
    displayName: "Self-Balancing Car",
    repo: "Genum_SELF_BALANCE_CAR",
    fwName: "Self Balancing Bot",
    fwVersion: "1.2.2",
    btName: "SELF BALANCING BOT",
    apSsid: null,
    apIp: null,
    transports: ["classic-bt", "wifi"],
  },
  {
    id: "wireless-car",
    displayName: "Wireless Car",
    repo: "Genum_WIRELESS_CAR",
    fwName: "Wireless Car",
    fwVersion: "1.8.0",
    btName: "WIRELESS CAR",
    apSsid: null,
    apIp: null,
    transports: ["classic-bt", "wifi-ap", "wifi-sta", "http", "websocket"],
  },
  {
    id: "smart-dustbin",
    displayName: "Smart Dustbin",
    repo: "Genum_SMART_DUSTBIN",
    fwName: "Smart Dustbin",
    fwVersion: "1.0.0",
    btName: null,
    apSsid: null,
    apIp: null,
    transports: ["wifi"],
  },
  {
    id: "remote-esp32",
    displayName: "ESP32 Remote Controller",
    repo: "Genum_REMOTE_ESP32",
    fwName: "Esp32 Remote",
    fwVersion: "1.6.7",
    btName: "REMOTE_CTRL",
    apSsid: "ESP32_Remote_OTA",
    apIp: null,
    transports: ["classic-bt", "rf", "wifi-ap-ota"],
  },
];

/** One physical unit the signed-in user owns. */
export type UserDevice = {
  deviceId: string;
  /** The owner's name for this unit. Falls back to the model name. */
  displayName: string;
  /** Resolved model, or null when the unit is not in the catalogue yet. */
  model: DeviceModel | null;
  /** The stable key this unit is known by (fw:<boardId> | MAC | wifi:*). */
  uniqueId: string;
  isFavourite: boolean;
  lastSeenAt: string | null;
  fwVersion: string;
};

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

function parseModel(row: Record<string, unknown>): DeviceModel | null {
  const id = asString(row.id);
  const displayName = asString(row.display_name);
  if (!id || !displayName) return null;
  const transports = Array.isArray(row.transports)
    ? (row.transports.filter((t) => typeof t === "string") as DeviceTransport[])
    : [];
  return {
    id,
    displayName,
    repo: asString(row.repo) ?? "",
    fwName: asString(row.fw_name) ?? "",
    fwVersion: asString(row.fw_version) ?? "",
    btName: asString(row.bt_name),
    apSsid: asString(row.ap_ssid),
    apIp: asString(row.ap_ip),
    transports,
  };
}

function getBundled(id: string): DeviceModel | null {
  return BUNDLED_DEVICE_MODELS.find((m) => m.id === id) ?? null;
}

/** All models, DB-first. Never throws: an unreachable DB is not an error. */
export async function fetchDeviceModels(): Promise<DeviceModel[]> {
  if (!supabaseConfigured) return BUNDLED_DEVICE_MODELS;
  try {
    const { data, error } = await supabase
      .from("device_models")
      .select("*")
      .order("sort_order");
    if (error || !data || data.length === 0) return BUNDLED_DEVICE_MODELS;
    const parsed = (data as Record<string, unknown>[]).map(parseModel);
    return parsed.filter((m): m is DeviceModel => m !== null);
  } catch {
    return BUNDLED_DEVICE_MODELS;
  }
}

/** One model by id, DB-first with the bundled fallback. */
export async function fetchDeviceModel(
  id: string,
): Promise<DeviceModel | null> {
  if (!supabaseConfigured) return getBundled(id);
  try {
    const { data, error } = await supabase
      .from("device_models")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return getBundled(id);
    return parseModel(data as Record<string, unknown>) ?? getBundled(id);
  } catch {
    return getBundled(id);
  }
}

/**
 * The garage: every unit this user owns, with their own name for it.
 *
 * `devices` is staff-maintained, so a car the user has actually driven may
 * not have a row yet. That is not an error - `car_profiles` still holds the
 * settings, and a `ensureDevice` call registers the unit properly.
 */
export async function fetchUserDevices(userId: string): Promise<UserDevice[]> {
  if (!supabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from("user_devices")
      .select(
        "device_id, display_name, is_favourite, devices(id, unique_id, model_id, fw_version, last_seen_at)",
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).flatMap((row) => {
      const device = (row.devices ?? null) as Record<string, unknown> | null;
      const deviceId = asString(row.device_id);
      if (!deviceId) return [];
      const modelId = device ? asString(device.model_id) : null;
      const own = asString(row.display_name);
      return [
        {
          deviceId,
          uniqueId: (device ? asString(device.unique_id) : null) ?? "",
          displayName: own || getBundled(modelId ?? "")?.displayName || "Car",
          model: modelId ? getBundled(modelId) : null,
          isFavourite: row.is_favourite === true,
          lastSeenAt: device ? asString(device.last_seen_at) : null,
          fwVersion: (device ? asString(device.fw_version) : null) ?? "",
        },
      ];
    });
  } catch {
    return [];
  }
}

/**
 * Register a unit the user just drove, so it can carry a name of its own.
 * Reuses resolveProfileKey so the unique_id matches what car_profiles already
 * stores - otherwise the same car would appear twice under two keys.
 *
 * Calls the `register_device` RPC rather than upserting `devices` directly.
 * `devices` is the SHARED fleet table and its INSERT policy is staff-only by
 * design, so a direct upsert fails RLS (42501) and the car is silently never
 * linked. The RPC is SECURITY DEFINER and links the unit to auth.uid() only,
 * which is exactly this function's intent - see
 * supabase/migrations/20261001140000_device_claim_rpc_and_backfill.sql.
 *
 * The userId argument is retained for call-site compatibility but is NOT sent
 * to the database: the server derives the owner from the session, so a
 * mismatched value can never attach a car to the wrong account.
 */
export async function ensureDevice(
  userId: string,
  identity: CarProfileIdentity,
  modelId?: string | null,
  fwVersion?: string | null,
): Promise<{ uniqueId: string; deviceId: string | null } | null> {
  if (!supabaseConfigured) return null;
  void userId;
  const uniqueId = resolveProfileKey(identity);
  if (!uniqueId) return null;
  try {
    const { data, error } = await supabase.rpc("register_device", {
      p_unique_id: uniqueId,
      p_model_id: modelId ?? null,
      p_fw_version: fwVersion ?? null,
    });
    if (error || !data) return { uniqueId, deviceId: null };
    return { uniqueId, deviceId: String(data) };
  } catch {
    return null;
  }
}

/** Set (or clear) the owner's name for one of their units. */
export async function setDeviceName(
  userId: string,
  deviceId: string,
  displayName: string,
): Promise<boolean> {
  if (!supabaseConfigured) return false;
  try {
    const { error } = await supabase.from("user_devices").upsert(
      {
        user_id: userId,
        device_id: deviceId,
        display_name: displayName.trim(),
      },
      { onConflict: "user_id,device_id" },
    );
    return !error;
  } catch {
    return false;
  }
}

/**
 * What the user will actually SEE when pairing, which is NOT the same as the
 * in-app name. A car called "4WD 4-Motor Car" in the app is announced as
 * "4WD CAR" over Bluetooth, and the OS pairing list shows the announced
 * name. Surfacing both is what stops "my car is missing" confusion.
 */
export function pairingLabel(model: DeviceModel | null): string {
  if (!model) return "Unknown device";
  if (model.btName && model.btName !== model.displayName)
    return `${model.displayName} (pairs as "${model.btName}")`;
  return model.displayName;
}
