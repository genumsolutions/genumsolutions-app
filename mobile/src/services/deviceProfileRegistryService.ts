// =====================================================================
// deviceProfileRegistryService — the USER hub's device registry (R4-7).
//
// One place that answers "every car/device this user has EVER connected
// through ANY transport (BLE / SPP / WiFi-AP / WiFi-STA / future ones)".
//
// Data model (owner: extend the existing stores, never a new table):
//   • CLOUD  — the U-52 `car_profiles` rows via carProfileService (the
//              per-car synced profile; profile_key = fw:<id> | BT MAC |
//              wifi:<identity>). One read gives name + last-saved drive
//              settings + router mirror, so the hub has real data to act
//              on with no new plumbing.
//   • LOCAL  — every DevicePrefs record in deviceMemory (the per-device
//              store the Control Hub writes on every save) + the
//              "last touched device" spill. This is what makes a device
//              appear even when it was never mirrored while signed out.
//
// OFFLINE-FIRST SYNC RULE (owner ③): the local records are the
// always-available truth — the hub renders instantly from the phone;
// the cloud read merges in when the network allows. A locally-known
// device that is missing from the cloud is PUSHED on the next sync
// (set-once semantics, last-saved-wins is already the engine's merge
// rule), so local-first data lands in the database automatically the
// moment the app has internet. No schema change is needed (F-45 probe
// rule not triggered — car_profiles already stores everything).
//
// Actions per device: RENAME (set) · EDIT (update the locally-stored
// display state; cloud mirrors through the normal saveCarProfile
// path) · FORGET (delete the local record, and the cloud row too when
// signed in). Nothing secret ever lives here: no passwords, no keys.
// =====================================================================
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../config/supabase";
import {
  deviceMemory,
  devicePrefsKey,
  type DevicePrefs,
} from "../components/tools/types";
import {
  fetchCarProfiles,
  saveCarProfile,
  deleteCarProfile,
  toCloudRecord,
  type CarProfileCloudRecord,
} from "./carProfileService";

/** AsyncStorage key prefix used by deviceMemory (see types.ts). */
const DEVICE_PREFIX = "genum.device.";
/** The "last touched device" spill written by the Control Hub. */
const LAST_DEVICE_KEY = "genum.lastDevice";

export type KnownDevice = {
  /** The stable profile key (fw:<id> | BT MAC | wifi:<identity>). */
  profileKey: string;
  /** Where this entry was first seen in THIS read. */
  source: "cloud" | "local";
  /** True when both the cloud row and a local record exist. */
  mirrored: boolean;
  /** Display name (car name; falls back to the key). */
  name: string;
  /** Firmware board id when the key is fw:<id> (v2 cars). */
  uniqueId: string | null;
  /** Every BT MAC this device has presented (from the local record). */
  btIds: string[];
  /** Router names mirrored from the car (names only). */
  savedRouters: string[];
  /** Last synced/stamped time — cloud updated_at or local savedAt (ms). */
  lastSeenAt: number | null;
  /** Drive snapshot for the hub's readout (already sanitized by origin). */
  settings: {
    modeId: string | null;
    speed: number | null;
    steerLimit: number | null;
    trim: number | null;
    useJoystick: boolean | null;
    /** Smart-link auto-join preference — editable from the hub (R4-7). */
    autoJoinRouter: boolean | null;
  } | null;
};

// ---------- local enumeration ----------

/** Enumerate every locally-stored DevicePrefs record. AsyncStorage has no
 *  list API in all runtimes, so we track the keys we wrote via a spill
 *  index, fall back to the last-device spill, and never throw. */
export async function readLocalDeviceIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_INDEX_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (k): k is string =>
          typeof k === "string" && k.startsWith(DEVICE_PREFIX),
      );
    }
  } catch {
    /* fall through */
  }
  return [];
}

const LOCAL_INDEX_KEY = "genum.device.index";

/** Add one key to the local index (idempotent, capped, never throws). */
export async function rememberDeviceKey(address: string): Promise<void> {
  try {
    const keys = await readLocalDeviceIndex();
    if (keys.includes(devicePrefsKey(address))) return;
    // Newest at the end; cap at 50 remembered devices.
    const next = [...keys, devicePrefsKey(address)].slice(-50);
    await AsyncStorage.setItem(LOCAL_INDEX_KEY, JSON.stringify(next));
  } catch {
    /* index is best-effort; deviceMemory itself remains authoritative */
  }
}

/** Read the last-device spill (address/name/savedRouters) if present. */
async function readLastDeviceSpill(): Promise<{
  address?: string;
  name?: string;
} | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_DEVICE_KEY);
    return raw
      ? (JSON.parse(raw) as { address?: string; name?: string })
      : null;
  } catch {
    return null;
  }
}

function prefsToKnownDevice(
  profileKey: string,
  prefs: DevicePrefs | null,
  source: "cloud" | "local",
): KnownDevice {
  const fw = profileKey.startsWith("fw:") ? profileKey.slice(3) : null;
  return {
    profileKey,
    source,
    mirrored: false,
    name:
      prefs?.name ||
      (fw
        ? `Car ${fw}`
        : profileKey.startsWith("wifi:")
          ? profileKey.slice(5)
          : profileKey),
    uniqueId: prefs?.uniqueId ?? fw,
    btIds: prefs?.btIds ?? [],
    savedRouters: prefs?.savedRouters ?? [],
    lastSeenAt: prefs?.savedAt ?? null,
    settings: prefs
      ? {
          modeId: prefs.modeId ?? null,
          speed: prefs.speed ?? null,
          steerLimit: prefs.steerLimit ?? null,
          trim: prefs.trim ?? null,
          useJoystick: prefs.useJoystick ?? null,
          autoJoinRouter: prefs.autoJoinRouter ?? null,
        }
      : null,
  };
}

function cloudToKnownDevice(row: CarProfileCloudRecord): KnownDevice {
  const s = row.settings as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const device = prefsToKnownDevice(row.profile_key, null, "cloud");
  device.name = row.car_name || device.name;
  device.uniqueId = row.unique_id ?? device.uniqueId;
  device.savedRouters = Array.isArray(s.saved_routers)
    ? (s.saved_routers as string[])
    : [];
  device.lastSeenAt = Date.parse(row.updated_at || "") || null;
  device.settings = {
    modeId: typeof s.mode_id === "string" ? s.mode_id : null,
    speed: num(s.speed),
    steerLimit: num(s.steer_limit),
    trim: num(s.trim),
    useJoystick: typeof s.use_joystick === "boolean" ? s.use_joystick : null,
    autoJoinRouter:
      typeof s.auto_join_router === "boolean" ? s.auto_join_router : null,
  };
  return device;
}

/**
 * The hub read: union of cloud car_profiles + local deviceMemory records
 * (+ the last-device spill so a single fresh link is never invisible).
 * Pure read — never writes. Offline-safe: a cloud failure just yields a
 * local-only list.
 */
export async function fetchKnownDevices(): Promise<{
  devices: KnownDevice[];
  offline: boolean;
}> {
  const [{ rows: cloudRows, offline }, localKeys, spill] = await Promise.all([
    fetchCarProfiles(),
    readLocalDeviceIndex(),
    readLastDeviceSpill(),
  ]);

  const byKey = new Map<string, KnownDevice>();
  for (const row of cloudRows) {
    byKey.set(row.profile_key, cloudToKnownDevice(row));
  }
  for (const storageKey of localKeys) {
    const profileKey = storageKey.slice(DEVICE_PREFIX.length);
    const prefs = await deviceMemory.read(profileKey);
    if (!prefs && !byKey.has(profileKey)) continue;
    const existing = byKey.get(profileKey);
    const localEntry = prefsToKnownDevice(profileKey, prefs, "local");
    if (!existing) {
      byKey.set(profileKey, localEntry);
      continue;
    }
    // Both sides know this device — merge the display fields, cloud name
    // wins (the user renamed it from any device), local identity richer.
    byKey.set(profileKey, {
      ...existing,
      mirrored: true,
      btIds: existing.btIds.length > 0 ? existing.btIds : localEntry.btIds,
      savedRouters:
        existing.savedRouters.length > 0
          ? existing.savedRouters
          : localEntry.savedRouters,
      uniqueId: existing.uniqueId ?? localEntry.uniqueId,
      lastSeenAt:
        Math.max(existing.lastSeenAt ?? 0, localEntry.lastSeenAt ?? 0) || null,
    });
  }
  // The last-device spill makes a first-ever link visible even before its
  // first prefs save produced a deviceMemory record.
  if (spill?.address && !byKey.has(spill.address)) {
    const prefs = await deviceMemory.read(spill.address);
    byKey.set(spill.address, prefsToKnownDevice(spill.address, prefs, "local"));
  }

  // Newest first, then name — stable, useful ordering.
  const devices = [...byKey.values()].sort(
    (a, b) =>
      (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0) || a.name.localeCompare(b.name),
  );
  return { devices, offline };
}

// ---------- actions (set · edit · delete) ----------

/**
 * SET — rename a device (the hub's "set" action). Updates the local record
 * and mirrors to the cloud row through the SAME saveCarProfile path the
 * Control Hub uses (push-on-save; offline-safe, last-saved-wins).
 */
export async function renameDevice(
  profileKey: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const clean = name.trim().slice(0, 120);
  if (!clean) return { ok: false, error: "Name is required." };
  const prefs = await deviceMemory.read(profileKey);
  if (prefs) {
    await deviceMemory.write(profileKey, { ...prefs, name: clean });
  }
  if (supabase) {
    // No local record (cloud-only device): build a minimal row from the
    // cloud shape we already know, or a stub the next real save replaces.
    const { rows } = await fetchCarProfiles();
    const row = rows.find((r) => r.profile_key === profileKey);
    if (row) {
      return saveCarProfile(
        {
          ...(prefs ?? cloudRowToPrefs(row)),
          name: clean,
        } as DevicePrefs,
        profileKey,
      );
    }
    if (!prefs) {
      // Device known only by its key (fresh spill) and not in the cloud:
      // persist the rename as a stub row so it survives the phone.
      return saveCarProfile(stubPrefs(profileKey, clean), profileKey);
    }
  }
  return { ok: true };
}

/** Minimal DevicePrefs from a cloud row (for cloud-only devices). */
function cloudRowToPrefs(row: CarProfileCloudRecord): DevicePrefs {
  const s = row.settings as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    address: row.profile_key,
    name: row.car_name || null,
    modeId: typeof s.mode_id === "string" ? s.mode_id : null,
    speed: num(s.speed) ?? 170,
    servo: num(s.servo) ?? 90,
    steerLimit: num(s.steer_limit) ?? 90,
    trim: num(s.trim) ?? 0,
    useJoystick: typeof s.use_joystick === "boolean" ? s.use_joystick : false,
    fullscreen: false,
    joystickLayout: "dual",
    lastWifiSsid: null,
    savedRouters: Array.isArray(s.saved_routers)
      ? (s.saved_routers as string[])
      : [],
    btIds: Array.isArray(s.bt_ids) ? (s.bt_ids as string[]) : [],
    wifiHistory: Array.isArray(row.wifi_history) ? row.wifi_history : [],
    uniqueId: row.unique_id ?? null,
    savedAt: Date.parse(row.updated_at || "") || Date.now(),
  } as DevicePrefs;
}

/** Smallest valid DevicePrefs for a device we only know by key. */
function stubPrefs(profileKey: string, name: string): DevicePrefs {
  return {
    address: profileKey,
    name,
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
    uniqueId: profileKey.startsWith("fw:") ? profileKey.slice(3) : null,
    savedAt: Date.now(),
  } as DevicePrefs;
}

/**
 * EDIT — replace the local record for a device from the hub (the owner's
 * "edit" action for device data without a live link). Writes deviceMemory
 * first (offline-first), then mirrors the full record to the cloud.
 */
export async function editDevice(
  profileKey: string,
  patch: Partial<Pick<DevicePrefs, "name" | "savedRouters" | "autoJoinRouter">>,
): Promise<{ ok: boolean; error?: string }> {
  const current =
    (await deviceMemory.read(profileKey)) ?? stubPrefs(profileKey, "");
  const next: DevicePrefs = {
    ...current,
    ...patch,
    name: patch.name?.trim().slice(0, 120) ?? current.name,
    savedAt: Date.now(),
  } as DevicePrefs;
  await deviceMemory.write(profileKey, next);
  return saveCarProfile(next, profileKey);
}

/**
 * DELETE — "forget this device". Removes the local record + index entry,
 * then the cloud row (signed in). The car itself is untouched: forgetting
 * is an APP memory action, never a command to the car.
 */
export async function forgetDevice(
  profileKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await AsyncStorage.removeItem(devicePrefsKey(profileKey));
    const keys = (await readLocalDeviceIndex()).filter(
      (k) => k !== devicePrefsKey(profileKey),
    );
    await AsyncStorage.setItem(LOCAL_INDEX_KEY, JSON.stringify(keys));
  } catch {
    /* local cleanup is best-effort; the cloud delete still runs */
  }
  return deleteCarProfile(profileKey);
}

// ---------- offline-first push (spill → DB) ----------

/**
 * SYNC — push every locally-known device that the cloud has never heard of
 * (or whose local save is newer) so the phone's offline-first records land
 * in the database once the app has internet. Fire-and-forget safe: never
 * throws, reports how many rows it pushed. Called on the hub screen focus.
 */
export async function pushLocalDevicesToCloud(): Promise<{
  pushed: number;
  offline: boolean;
}> {
  const [{ devices, offline }, userId] = await Promise.all([
    fetchKnownDevices(),
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        return data.user?.id ?? "";
      } catch {
        return "";
      }
    })(),
  ]);
  if (offline || !userId) return { pushed: 0, offline: true };
  let pushed = 0;
  for (const device of devices) {
    if (device.source !== "local") continue;
    const prefs = await deviceMemory.read(device.profileKey);
    // Factory-fresh or absent local records have nothing to say yet.
    if (!prefs || !prefs.savedAt) continue;
    const fresh =
      (prefs.savedRouters?.length ?? 0) === 0 &&
      (prefs.wifiHistory?.length ?? 0) === 0 &&
      (prefs.btIds?.length ?? 0) === 0 &&
      prefs.speed === 170 &&
      prefs.trim === 0;
    if (fresh) continue;
    const result = await saveCarProfile(prefs, device.profileKey);
    if (result.ok) pushed += 1;
  }
  return { pushed, offline: false };
}

/** Re-export so the screen imports from ONE module. */
export { toCloudRecord };
