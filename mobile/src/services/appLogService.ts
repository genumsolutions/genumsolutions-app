// =====================================================================
// appLogService - the persisted app log ring + its DB upload path
// (owner 2026-10-12).
//
// THE FEATURE: the app's logger was console-only, so every runtime error
// lived on one phone and died with it. This module keeps a bounded
// AsyncStorage ring of warn/error lines and best-effort-flushes them to the
// shared Supabase `app_logs` table, so staff/admin see what the app has been
// doing across the fleet (AdminScreen "System Logs" tab + website AdminLogs).
//
// Design rules, all load-bearing:
//
//   1. NEVER BLOCKS THE CALLER, NEVER THROWS. `logger` calls appendLog() with
//      fire-and-forget semantics; a full disk or a dead network must not break
//      a connect or a screen. Every public function swallows its errors.
//   2. BOUNDED AT BOTH ENDS. Ring caps at 250 lines (the shared medium keeps
//      fresh context); the pending upload queue caps at 50 so a dead zone
//      cannot grow an unbounded backlog. Oldest lines drop first.
//   3. OFFLINE-FIRST. A failed flush stays queued and is retried on the next
//      link-up, exactly like crashReportService.
//   4. NO SECRETS ON THE WIRE. Call sites must not pass tokens/keys in `detail`
//      (the console-format separation). `detail` is serialized defensively: an
//      Error becomes {name,message,stack}; anything JSON fails becomes null.
// =====================================================================
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { supabase, supabaseConfigured } from "../config/supabase";
import { APP_VERSION } from "../config/site";

export type AppLogLevel = "info" | "warn" | "error";

/** One ring entry (what the phone saw). */
export type AppLogEntry = {
  id: string;
  ts: string;
  scope: string;
  level: AppLogLevel;
  message: string;
  detail: Record<string, unknown> | null;
};

/** One queue row, shaped for the `app_logs` insert. */
export type AppLogRow = AppLogEntry & {
  app_version: string;
  platform: string;
  user_id: string | null;
  sync_status: "pending" | "failed";
};

const RING_KEY = "genum.app.logs.ring";
const QUEUE_KEY = "genum.app.logs.pending";
const RING_CAP = 250;
const QUEUE_CAP = 50;

function createId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  ).toUpperCase();
}

function safeDetail(detail?: unknown): Record<string, unknown> | null {
  if (detail === undefined || detail === null) return null;
  if (detail instanceof Error) {
    const out: Record<string, unknown> = {
      name: detail.name,
      message: detail.message,
    };
    if (detail.stack) {
      out.stack = detail.stack.split("\n").slice(0, 8).join("\n");
    }
    return out;
  }
  if (typeof detail === "object") {
    try {
      const parsed = JSON.parse(JSON.stringify(detail)) as unknown;
      if (parsed !== null && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return { value: String(detail) };
}

async function readRing(): Promise<AppLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(RING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AppLogEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeRing(entries: AppLogEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      RING_KEY,
      JSON.stringify(entries.slice(-RING_CAP)),
    );
  } catch {
    // best-effort
  }
}

async function readQueue(): Promise<AppLogRow[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AppLogRow[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(rows: AppLogRow[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      QUEUE_KEY,
      JSON.stringify(rows.slice(-QUEUE_CAP)),
    );
  } catch {
    // best-effort
  }
}

/** Best-effort signed-in user id for attribution; a guest logs anonymously. */
async function currentUserId(): Promise<string | null> {
  if (!supabaseConfigured) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Append one line to the local ring AND queue the upload. Fire-and-forget:
 * callers must NOT await it to protect their own flow.
 */
export async function appendLog(input: {
  scope: string;
  level: AppLogLevel;
  message: string;
  detail?: unknown;
}): Promise<void> {
  try {
    const entry: AppLogEntry = {
      id: createId(),
      ts: new Date().toISOString(),
      scope: String(input.scope ?? "").slice(0, 64),
      level: input.level,
      message: String(input.message ?? "").slice(0, 1000),
      detail: safeDetail(input.detail),
    };
    const ring = await readRing();
    ring.push(entry);
    await writeRing(ring);

    const queue = await readQueue();
    queue.push({
      ...entry,
      app_version: APP_VERSION,
      platform: Platform.OS,
      user_id: await currentUserId(),
      sync_status: "pending",
    });
    await writeQueue(queue);
  } catch {
    // never throws
  }
}

/** Push one row to Supabase. Returns true when it landed. */
async function pushRow(row: AppLogRow): Promise<boolean> {
  if (!supabaseConfigured) return false;
  try {
    const { error } = await supabase.from("app_logs").insert({
      user_id: row.user_id,
      device_id: null,
      app_version: row.app_version,
      platform: row.platform,
      scope: row.scope,
      level: row.level,
      message: row.message,
      detail: row.detail,
      created_at: row.ts,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Flush every queued line. Called on link-up (like flushCrashReports) so a
 * failed flush eventually reaches the shared table. Best-effort: never throws.
 */
export async function flushAppLogs(): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) return;
  const remaining: AppLogRow[] = [];
  for (const row of queue) {
    const ok = await pushRow(row);
    if (!ok) remaining.push({ ...row, sync_status: "failed" });
  }
  await writeQueue(remaining);
}
