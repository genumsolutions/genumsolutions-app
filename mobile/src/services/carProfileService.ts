// =====================================================================
// carProfileService — per-device car profiles, LOCAL + CLOUD (owner ④⑩).
//
// Local truth is the app's existing per-device pref record (DevicePrefs via
// DeviceMemory, keyed by profileKey). This service is the layer that turns
// that record into a profile: it RESOLVES the stable key, keeps the Wi-Fi
// history / BT-id sets, and mirrors the profile to the `car_profiles`
// Supabase table for signed-in users (mirrors robotSettingsService: upsert
// on user_id + profile_key, owner RLS, offline-first cache).
//
// Key resolution order (stable first):
//   1. `fw:<boardId>`   — firmware ESP.getEfuseMac() last 6 hex (v2 cars).
//   2. BT MAC           — the classic unique address.
//   3. `wifi:<identity>`— WiFi-only legacy fallback (ssid|ap|url).
// So a car keeps ONE profile across renames and across links.
// =====================================================================
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../config/supabase";
import { SPEED_MAX, SPEED_MIN } from "./carProtocol";
import type { DevicePrefs } from "../components/tools/types";

export type WifiHistoryEntry = { ssid: string; lastSeen: number };

export type CarProfileIdentity = {
  /** Board-unique id from firmware (ESP.getEfuseMac(), last 6 hex). */
  fwId?: string | null;
  /** Classic SPP MAC address (primary BT identity). */
  btAddress?: string | null;
  /** WiFi-only identity (ssid | ap | url) for links with no BT at all. */
  wifiIdentity?: string | null;
};

export const WIFI_HISTORY_CAP = 50;
const BT_IDS_CAP = 20;

/** The stable per-car profile key. Returns null if nothing identifies the car. */
export function resolveProfileKey(i: CarProfileIdentity): string | null {
  const fw = i.fwId?.trim();
  if (fw) return `fw:${fw}`;
  const bt = i.btAddress?.trim();
  if (bt) return bt;
  const wi = i.wifiIdentity?.trim();
  return wi ? `wifi:${wi}` : null;
}

/** Add/refresh one SSID, newest-first, deduped by ssid, capped. Pure. */
export function upsertWifiHistory(
  history: WifiHistoryEntry[] | null | undefined,
  ssid: string,
  atMs: number = Date.now(),
): WifiHistoryEntry[] {
  const clean = (history ?? []).filter(
    (h) => typeof h?.ssid === "string" && h.ssid.length > 0,
  );
  const rest = clean.filter((h) => h.ssid !== ssid);
  return [{ ssid, lastSeen: atMs }, ...rest].slice(0, WIFI_HISTORY_CAP);
}

/** Record one BT MAC once, capped. Pure. */
export function addBtId(
  ids: string[] | null | undefined,
  address: string,
): string[] {
  const clean = (ids ?? []).filter(
    (a) => typeof a === "string" && a.length > 0,
  );
  if (!address) return clean.slice(0, BT_IDS_CAP);
  if (clean.includes(address)) return clean.slice(0, BT_IDS_CAP);
  // Newest MAC must survive the cap: keep the newest BT_IDS_CAP - 1, append.
  return [...clean.slice(0, BT_IDS_CAP - 1), address];
}

export type PickRouterInput = {
  /** Routers the CAR has stored (the `networks` echo / savedRouters mirror). */
  saved: string[];
  /** Car-side scan result (ROUTERS;SCAN) with signal strengths. */
  scan?: Array<{ ssid: string; rssi?: number | null }> | null;
  /** Wi-Fi history, newest first. */
  history?: WifiHistoryEntry[] | null;
  /** Last SSID sent to this car. */
  lastSsid?: string | null;
};

/**
 * Pick the router the car should auto-join (smart-link). Rule (owner ③):
 * "use it if available WITH STRENGTH, else fall back to the car's own AP."
 * Strategy: prefer a saved router the car's own antenna currently hears
 * (scan rssi, strongest wins, recency breaks ties); when no scan overlap,
 * fall back to the most recently used saved router. Returns null when there
 * is nothing to join (stay on the car's own AP). Pure.
 */
export function pickBestRouter(input: PickRouterInput): string | null {
  const saved = (input.saved ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  if (saved.length === 0) return null;

  const history = (input.history ?? []).filter(
    (h) => typeof h?.ssid === "string" && h.ssid.length > 0,
  );
  const last = input.lastSsid?.trim() || null;
  const recency = (ssid: string): number => {
    const inHistory =
      history.findIndex((h) => h.ssid === ssid) + 1 || Number.MAX_SAFE_INTEGER;
    const isLast = ssid === last ? 0 : Number.MAX_SAFE_INTEGER;
    return Math.min(inHistory, isLast);
  };

  const hearable = (input.scan ?? [])
    .map((n) => ({
      ssid: typeof n?.ssid === "string" ? n.ssid.trim() : "",
      rssi:
        typeof n?.rssi === "number" && Number.isFinite(n.rssi) ? n.rssi : null,
    }))
    .filter((n) => n.ssid.length > 0);

  const heard = hearable.filter((n) => saved.includes(n.ssid));
  if (heard.length > 0) {
    const byRssi = heard.some((n) => n.rssi != null)
      ? heard
          .filter((n) => n.rssi != null)
          .sort(
            (a, b) =>
              (b.rssi ?? -Infinity) - (a.rssi ?? -Infinity) ||
              recency(a.ssid) - recency(b.ssid),
          )
      : heard.slice().sort((a, b) => recency(a.ssid) - recency(b.ssid));
    return byRssi[0].ssid;
  }

  const byRecency = saved.slice().sort((a, b) => recency(a) - recency(b));
  return byRecency[0] || null;
}

export type CarProfileCloudRecord = {
  profile_key: string;
  car_name: string;
  unique_id: string | null;
  settings: Record<string, unknown>;
  wifi_history: WifiHistoryEntry[];
  updated_at: string;
};

// ----- cloud shape (only what is safe to sync; nothing secret ever lives
// here — passwords were already never stored. history/routers are names). ---

/** Map a local prefs record to the cloud row shape. */
export function toCloudRecord(
  prefs: DevicePrefs,
  profileKey: string,
): CarProfileCloudRecord {
  const settings: Record<string, unknown> = {
    mode_id: prefs.modeId ?? null,
    speed: prefs.speed ?? null,
    servo: prefs.servo ?? null,
    steer_limit: prefs.steerLimit ?? null,
    trim: prefs.trim ?? null,
    use_joystick: prefs.useJoystick ?? null,
    joystick_layout: prefs.joystickLayout ?? null,
    last_wifi_url: prefs.lastWifiUrl ?? null,
    auto_join_router: prefs.autoJoinRouter ?? true,
    bt_ids: prefs.btIds ?? [],
    saved_routers: prefs.savedRouters ?? [],
  };
  return {
    profile_key: profileKey,
    car_name: (prefs.name ?? "").slice(0, 120),
    unique_id: prefs.uniqueId ?? null,
    settings,
    wifi_history: (prefs.wifiHistory ?? []).slice(0, WIFI_HISTORY_CAP),
    updated_at: new Date().toISOString(),
  };
}

// =====================================================================
// Sync engine (this session): "everything the user last saved IS the
// profile" — one merged DevicePrefs per account per car, written back to
// cloud on every save and adopted on connect. Merge is per-key
// last-saved-wins with fresh default detection; NOTHING secret ever
// leaves the phone (no wifi password, no keys — names only).
// =====================================================================

/** Settings keys eligible for cloud sync + the sanitizer per key. */
const SYNCABLE_SETTINGS = {
  mode_id: (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 && v.length <= 64 ? v : null,
  speed: (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null,
  servo: (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null,
  steer_limit: (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null,
  trim: (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null,
  use_joystick: (v: unknown): boolean | null =>
    typeof v === "boolean" ? v : null,
  joystick_layout: (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 && v.length <= 64 ? v : null,
  last_wifi_url: (v: unknown): string | null =>
    typeof v === "string" && v.length <= 500 ? v : null,
  auto_join_router: (v: unknown): boolean | null =>
    typeof v === "boolean" ? v : null,
  bt_ids: (v: unknown): string[] | null =>
    Array.isArray(v) &&
    v.length <= 20 &&
    v.every((s) => typeof s === "string" && s.length > 0 && s.length <= 32)
      ? (v as string[])
      : null,
  saved_routers: (v: unknown): string[] | null =>
    Array.isArray(v) &&
    v.length <= WIFI_HISTORY_CAP &&
    v.every((s) => typeof s === "string" && s.length > 0 && s.length <= 64)
      ? (v as string[])
      : null,
} as const;

/**
 * Rebuild DevicePrefs from a cloud row's sanitized settings, on top of the
 * app defaults (base). Unknown keys are dropped (forward-compatible); value
 * types are enforced so a corrupt/foreign row can never poison the app.
 */
export function prefsFromCloudSettings(
  settings: Record<string, unknown> | null | undefined,
  base: Omit<DevicePrefs, "address">,
): DevicePrefs {
  const s = settings ?? {};
  return {
    address: null,
    name: base.name,
    modeId: SYNCABLE_SETTINGS.mode_id(s.mode_id) ?? base.modeId,
    speed: SYNCABLE_SETTINGS.speed(s.speed) ?? base.speed,
    servo: SYNCABLE_SETTINGS.servo(s.servo) ?? base.servo,
    steerLimit: SYNCABLE_SETTINGS.steer_limit(s.steer_limit) ?? base.steerLimit,
    trim: SYNCABLE_SETTINGS.trim(s.trim) ?? base.trim,
    useJoystick:
      SYNCABLE_SETTINGS.use_joystick(s.use_joystick) ?? base.useJoystick,
    joystickLayout:
      SYNCABLE_SETTINGS.joystick_layout(s.joystick_layout) ??
      base.joystickLayout,
    fullscreen: base.fullscreen,
    lastWifiSsid: base.lastWifiSsid ?? null,
    savedRouters:
      SYNCABLE_SETTINGS.saved_routers(s.saved_routers) ??
      base.savedRouters ??
      [],
    uniqueId: base.uniqueId ?? null,
    btIds: SYNCABLE_SETTINGS.bt_ids(s.bt_ids) ?? base.btIds ?? [],
    wifiHistory: base.wifiHistory ?? [],
    lastWifiUrl:
      SYNCABLE_SETTINGS.last_wifi_url(s.last_wifi_url) ??
      base.lastWifiUrl ??
      null,
    autoJoinRouter:
      SYNCABLE_SETTINGS.auto_join_router(s.auto_join_router) ??
      base.autoJoinRouter ??
      true,
  } as DevicePrefs;
}

/** True when a local prefs record still carries its fresh defaults — i.e.
    the user has never meaningfully customized this car on this device.
    Used to decide whether a cloud profile should adopt over it. Pure. */
export function isFreshDefaultPrefs(prefs: DevicePrefs | null): boolean {
  if (!prefs) return true;
  const meaningfulRouters = (prefs.savedRouters ?? []).length > 0;
  const meaningfulHistory = (prefs.wifiHistory ?? []).length > 0;
  const meaningfulBt = (prefs.btIds ?? []).length > 0;
  return (
    prefs.speed === 170 &&
    prefs.servo === 90 &&
    prefs.steerLimit === 90 &&
    prefs.trim === 0 &&
    prefs.useJoystick === false &&
    prefs.joystickLayout === "dual" &&
    prefs.modeId == null &&
    !meaningfulRouters &&
    !meaningfulHistory &&
    !meaningfulBt
  );
}

export type MergedCarProfile = {
  /** The merged, applied DevicePrefs (cloud wins per-key when newer). */
  prefs: DevicePrefs;
  /** Whether the merged record differs from the local one (needs persist). */
  changed: boolean;
  /** "cloud" = cloud row won (newer), "local" = local prefs kept. */
  source: "cloud" | "local";
};

/** Last cloud-mirror attempt for the current car profile (UI badge state). */
export type ProfileSyncState =
  | { state: "synced"; at: number }
  | { state: "adopted"; at: number }
  | { state: "offline" };

/**
 * Merge one cloud profile into the local prefs record for the same car.
 * Semantics (owner spec): the user's LAST-SAVED values win per key — the
 * cloud row's updated_at vs the local record's savedAt decides whose
 * "last save" is newer; a fresh local default always adopts the cloud
 * profile (first link on a new phone must restore the car). Values are
 * clamped into the ranges the car accepts (speed 100..255 linear,
 * servo/steer 0..180, trim ±100). Pure.
 */
export function mergeCloudProfile(
  cloud: CarProfileCloudRecord,
  local: DevicePrefs | null,
  base: Omit<DevicePrefs, "address">,
): MergedCarProfile {
  const fromCloud = prefsFromCloudSettings(cloud.settings, base);
  // Carry local-only display bits the cloud row does not own.
  fromCloud.name = cloud.car_name || local?.name || base.name;
  fromCloud.address = local?.address ?? null;
  fromCloud.lastWifiSsid = local?.lastWifiSsid ?? fromCloud.lastWifiSsid;

  const cloudTime = Date.parse(cloud.updated_at || "") || 0;
  const localTime = local?.savedAt ?? 0;
  const fresh = isFreshDefaultPrefs(local);
  const cloudWins = fresh || cloudTime > localTime;

  const merged = cloudWins ? fromCloud : { ...local! };
  if (merged.speed != null) {
    merged.speed = Math.max(
      SPEED_MIN,
      Math.min(SPEED_MAX, Math.round(merged.speed)),
    );
  }
  if (merged.servo != null) {
    merged.servo = Math.max(0, Math.min(180, Math.round(merged.servo)));
  }
  if (merged.steerLimit != null) {
    merged.steerLimit = Math.max(
      0,
      Math.min(180, Math.round(merged.steerLimit)),
    );
  }
  if (merged.trim != null) {
    merged.trim = Math.max(-100, Math.min(100, Math.round(merged.trim)));
  }
  if (localTime > 0 && !cloudWins) {
    merged.savedAt = localTime;
  } else if (cloudTime > 0) {
    merged.savedAt = cloudTime;
  }

  // No local record? Then "changed" means: the cloud row differs from the
  // app's factory defaults (i.e. adoption actually restores something).
  const before: DevicePrefs =
    local ?? prefsFromCloudSettings({} as Record<string, unknown>, base);
  const changed =
    JSON.stringify({ ...merged, savedAt: 0 }) !==
    JSON.stringify({ ...before, savedAt: 0 });
  return { prefs: merged, changed, source: cloudWins ? "cloud" : "local" };
}

const CACHE_KEY = "genum-car-profiles-v1";

function cacheAll(rows: CarProfileCloudRecord[]) {
  void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(rows)).catch(
    () => undefined,
  );
}

async function readCache(): Promise<CarProfileCloudRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CarProfileCloudRecord[]) : [];
  } catch {
    return [];
  }
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? "";
}

/** Fetch every cloud car profile for the signed-in user (falls back to cache). */
export async function fetchCarProfiles(): Promise<{
  rows: CarProfileCloudRecord[];
  offline: boolean;
}> {
  try {
    const userId = await currentUserId();
    if (!userId) return { rows: await readCache(), offline: true };
    const { data, error } = await supabase
      .from("car_profiles")
      .select(
        "profile_key, car_name, unique_id, settings, wifi_history, updated_at",
      )
      .eq("user_id", userId)
      .order("car_name", { ascending: true });
    if (error) return { rows: await readCache(), offline: true };
    const rows: CarProfileCloudRecord[] = (data || []).map((row) => ({
      profile_key: row.profile_key as string,
      car_name: (row.car_name as string) || "",
      unique_id: (row.unique_id as string) ?? null,
      settings: (row.settings as Record<string, unknown>) || {},
      wifi_history: (row.wifi_history as WifiHistoryEntry[]) || [],
      updated_at: row.updated_at as string,
    }));
    cacheAll(rows);
    return { rows, offline: false };
  } catch {
    return { rows: await readCache(), offline: true };
  }
}

/** Upsert one profile for the signed-in user (owner RLS; offline-safe). */
export async function saveCarProfile(
  prefs: DevicePrefs,
  profileKey: string,
): Promise<{ ok: boolean; error?: string; offline?: boolean }> {
  const record = toCloudRecord(prefs, profileKey);
  try {
    const userId = await currentUserId();
    if (!userId) {
      // Signed out or still loading — keep it local; try again when signed in.
      return { ok: false, offline: true, error: "Not signed in." };
    }
    const { error } = await supabase.from("car_profiles").upsert(
      {
        user_id: userId,
        profile_key: record.profile_key,
        car_name: record.car_name,
        unique_id: record.unique_id,
        settings: record.settings as Record<string, never>,
        wifi_history: record.wifi_history,
        updated_at: record.updated_at,
      },
      { onConflict: "user_id,profile_key" },
    );
    if (error) {
      return {
        ok: false,
        error: error.message || "Could not save the car profile.",
      };
    }
    const { rows } = await fetchCarProfiles();
    cacheAll(rows);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not save the car profile.",
    };
  }
}

/** Delete one profile row for the signed-in user. */
export async function deleteCarProfile(
  profileKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("car_profiles")
      .delete()
      .eq("profile_key", profileKey)
      .eq("user_id", await currentUserId());
    if (error)
      return { ok: false, error: error.message || "Could not delete." };
    const { rows } = await fetchCarProfiles();
    cacheAll(rows);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not delete.",
    };
  }
}
