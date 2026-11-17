// =====================================================================
// robotSettingsService — per-user, per-robot preference profiles
// (code values, tuning parameters, telemetry channel picks).
//
// Stored in the dedicated robot_user_settings table (one row per
// user × robot) — COMPLETELY SEPARATE from carts/orders. Pro-only:
// the server rejects writes for free users; the UI gates earlier.
// Admins can read/edit every user's rows from the website admin panel
// (service role), so every account stays fully tracked.
//
// Offline-first: the last state is cached in AsyncStorage so the
// Settings → Robot preferences screen still opens with no network.
// =====================================================================
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../config/supabase";

export type RobotSettingValue = string | number | boolean | string[];

export type RobotSettingRow = {
  robotId: string;
  robotName: string;
  settings: Record<string, RobotSettingValue>;
  updatedAt: string;
};

const CACHE_KEY = "genum-robot-settings";

function cacheAll(rows: RobotSettingRow[]) {
  void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(rows)).catch(
    () => undefined,
  );
}

async function readCache(): Promise<RobotSettingRow[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as RobotSettingRow[]) : [];
  } catch {
    return [];
  }
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? "";
}

/** Fetch every robot profile for the signed-in user (falls back to cache). */
export async function fetchRobotSettings(): Promise<{
  rows: RobotSettingRow[];
  offline: boolean;
}> {
  try {
    const userId = await currentUserId();
    if (!userId) return { rows: await readCache(), offline: true };
    const { data, error } = await supabase
      .from("robot_user_settings")
      .select("robot_id, robot_name, settings, updated_at")
      .eq("user_id", userId)
      .order("robot_name", { ascending: true });
    if (error) return { rows: await readCache(), offline: true };
    const rows: RobotSettingRow[] = (data || []).map((row) => ({
      robotId: row.robot_id as string,
      robotName: (row.robot_name as string) || "",
      settings: (row.settings as Record<string, RobotSettingValue>) || {},
      updatedAt: row.updated_at as string,
    }));
    cacheAll(rows);
    return { rows, offline: false };
  } catch {
    return { rows: await readCache(), offline: true };
  }
}

/** Same sanitizer as the website API — flat scalars + short string arrays only. */
function sanitize(
  input: Record<string, unknown>,
): Record<string, RobotSettingValue> {
  const out: Record<string, RobotSettingValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(key)) continue;
    if (
      value == null ||
      ["string", "number", "boolean"].includes(typeof value)
    ) {
      out[key] = value as RobotSettingValue;
    } else if (
      Array.isArray(value) &&
      value.length <= 100 &&
      value.every((item) =>
        ["string", "number", "boolean"].includes(typeof item),
      )
    ) {
      out[key] = value.map((item) =>
        typeof item === "boolean" ? String(item) : item,
      ) as RobotSettingValue;
    } else if (typeof value === "object") {
      // Flatten one level: nested objects become JSON strings so the row
      // stays a flat, queryable map on both clients.
      try {
        out[key] = JSON.stringify(value);
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

/** Create or update one robot profile (upsert on user_id + robot_id). */
export async function saveRobotSetting(
  robotId: string,
  robotName: string,
  settings: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const clean = sanitize(settings);
  try {
    const { error } = await supabase.from("robot_user_settings").upsert(
      {
        user_id: await currentUserId(),
        robot_id: robotId,
        robot_name: robotName.slice(0, 120),
        settings: clean,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,robot_id" },
    );
    if (error) {
      // 403-class RLS/policy rejections surface as a friendly Pro gate.
      const message = error.message || "";
      if (/row-level security|policy|Forbidden/i.test(message))
        return {
          ok: false,
          error:
            "Robot settings are a Pro feature — ask GENUM Solutions to upgrade your account.",
        };
      return { ok: false, error: message || "Could not save." };
    }
    const { rows } = await fetchRobotSettings();
    cacheAll(rows);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not save.",
    };
  }
}

/** Delete one robot profile. */
export async function deleteRobotSetting(robotId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("robot_user_settings")
      .delete()
      .eq("robot_id", robotId)
      .eq("user_id", await currentUserId());
    if (error) return false;
    const { rows } = await fetchRobotSettings();
    cacheAll(rows);
    return true;
  } catch {
    return false;
  }
}
