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

// ----- cloud shape (only what is safe to sync; nothing secret ever lives
// here — passwords were already never stored. history/routers are names). ---

export type CarProfileCloudRecord = {
  profile_key: string;
  car_name: string;
  unique_id: string | null;
  settings: Record<string, unknown>;
  wifi_history: WifiHistoryEntry[];
  updated_at: string;
};

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
