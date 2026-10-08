// =====================================================================
// crashReportService - fleet firmware diagnostics (owner 2026-10-08).
//
// THE FEATURE: the moment the app connects to a car it shares the car's last
// stored restart record (reset_reason, boot_count, crash_count,
// last_crash_phase, last_crash_heap) with the shared Supabase
// `device_crash_reports` table, so a fault can be tracked and fixed across the
// fleet instead of being stranded on one phone.
//
// Design rules, all load-bearing:
//
//   1. ONE ROW PER CONNECTION SESSION, never per telemetry frame. The car
//      broadcasts `/status` on a loop; the app snapshot must not become a
//      flood. The caller reports once per (link-up -> first usable status), and
//      this module DEDUPES the rest against the last record it synced for the
//      same board.
//   2. OFFLINE-FIRST. A failed push is queued in AsyncStorage and retried on
//      the next successful connection. The car's health data must survive a
//      dead zone exactly like every other local-first write in this app.
//   3. MISSING IS UNKNOWN, NEVER ZERO. Firmware older than 1.2.0 sends none of
//      these fields; a report with them all pending must not invent crashes.
//      `has_crash` is true only when the car actually reported a crash_count.
//   4. NO PII BEYOND WHAT THE CAR ALREADY EXPOSES. `ssid`/`ip` are network
//      identifiers the car itself reports; no phone identifiers, no location.
//      A signed-in user is attached, a guest is anonymous (RLS allows both).
// =====================================================================
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { supabase, supabaseConfigured } from "../config/supabase";
import { APP_VERSION } from "../config/site";

/** One connection session's snapshot of the car's restart record. */
export type CrashReportInput = {
  /** Firmware board-unique id (ESP.getEfuseMac last 6 hex). Null when absent. */
  boardId?: string | null;
  /** Device model slug when resolvable (e.g. "4wd4m"). */
  modelId?: string | null;
  /** Firmware version the car reports, when it reports one. */
  fwVersion?: string | null;
  /** The method that reached the car: bluetooth | wifi | internet. */
  connectionMethod: string;
  ssid?: string | null;
  ip?: string | null;
  resetReason?: string | null;
  bootCount?: number | null;
  crashCount?: number | null;
  lastCrashPhase?: string | null;
  lastCrashHeap?: number | null;
  freeHeap?: number | null;
  uptimeMs?: number | null;
  /** The raw status object, for deeper debugging. Kept small. */
  statusJson?: Record<string, unknown> | null;
  /** Random per-link id so two sessions are distinguishable. */
  sessionId?: string | null;
};

/** The row shape written to `device_crash_reports`. */
export type CrashReportRow = {
  board_id: string;
  model_id: string | null;
  fw_version: string;
  app_version: string;
  platform: string;
  connection_method: string;
  ssid: string | null;
  ip: string | null;
  reset_reason: string | null;
  boot_count: number | null;
  crash_count: number | null;
  last_crash_phase: string | null;
  last_crash_heap: number | null;
  free_heap: number | null;
  uptime_ms: number | null;
  status_json: Record<string, unknown> | null;
  has_crash: boolean;
  reported_at: string;
  synced_at: string;
  sync_status: "pending" | "synced" | "failed";
  user_id: string | null;
  device_id: string | null;
  session_id: string | null;
};

const QUEUE_KEY = "genum.crashReports.queue";
const LAST_SYNC_KEY = "genum.crashReports.last";
const QUEUE_CAP = 50;

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Pure: turn an input snapshot into the DB row. `has_crash` is true only when
 * the car actually reported a crash counter - it is never inferred.
 */
export function buildCrashReport(
  input: CrashReportInput,
  opts: { userId?: string | null; deviceId?: string | null; now?: Date } = {},
): CrashReportRow {
  const now = opts.now ?? new Date();
  const reportedAt = now.toISOString();
  const crashCount = numOrNull(input.crashCount);
  return {
    board_id: strOrNull(input.boardId) ?? "",
    model_id: strOrNull(input.modelId),
    fw_version: strOrNull(input.fwVersion) ?? "",
    app_version: APP_VERSION,
    platform: Platform.OS,
    connection_method: strOrNull(input.connectionMethod) ?? "",
    ssid: strOrNull(input.ssid),
    ip: strOrNull(input.ip),
    reset_reason: strOrNull(input.resetReason),
    boot_count: numOrNull(input.bootCount),
    crash_count: crashCount,
    last_crash_phase: strOrNull(input.lastCrashPhase),
    last_crash_heap: numOrNull(input.lastCrashHeap),
    free_heap: numOrNull(input.freeHeap),
    uptime_ms: numOrNull(input.uptimeMs),
    status_json: input.statusJson ?? null,
    has_crash: crashCount !== null && crashCount > 0,
    reported_at: reportedAt,
    synced_at: reportedAt,
    sync_status: "pending",
    user_id: opts.userId ?? null,
    device_id: opts.deviceId ?? null,
    session_id: strOrNull(input.sessionId),
  };
}

/** Identity of the restart record itself - two equal keys are the same fault. */
export function crashReportKey(r: {
  board_id: string;
  boot_count: number | null;
  crash_count: number | null;
  reset_reason: string | null;
}): string {
  return [
    r.board_id,
    r.boot_count ?? "",
    r.crash_count ?? "",
    r.reset_reason ?? "",
  ].join("|");
}

/**
 * Pure: should this report be sent, given the last one synced for this board?
 *
 * A report is skipped only when it describes the EXACT same restart record we
 * already sent - same board, same boot, same crash count, same reason. Every
 * new boot, every new crash, or a changed reason is a new row.
 */
export function shouldSendReport(
  candidate: Pick<
    CrashReportRow,
    "board_id" | "boot_count" | "crash_count" | "reset_reason"
  >,
  lastSyncedKey: string | null,
): boolean {
  if (!candidate.board_id) return false;
  return crashReportKey(candidate) !== lastSyncedKey;
}

async function readQueue(): Promise<CrashReportRow[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CrashReportRow[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(rows: CrashReportRow[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      QUEUE_KEY,
      JSON.stringify(rows.slice(-QUEUE_CAP)),
    );
  } catch {
    // Queue persistence is best-effort; a full disk must not break a connect.
  }
}

async function readLastKey(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

async function writeLastKey(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SYNC_KEY, key);
  } catch {
    // ignored
  }
}

/** Push one row to Supabase. Returns true when it landed. */
async function pushRow(row: CrashReportRow): Promise<boolean> {
  if (!supabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from("device_crash_reports")
      .insert({ ...row, sync_status: "synced" });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Flush every queued report. Called after a successful connect so a report
 * stranded by an earlier dead zone eventually reaches the fleet table.
 * Best-effort: never throws.
 */
export async function flushCrashReports(): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) return;
  const remaining: CrashReportRow[] = [];
  for (const row of queue) {
    const ok = await pushRow({ ...row, sync_status: "synced" });
    if (!ok) remaining.push({ ...row, sync_status: "failed" });
  }
  await writeQueue(remaining);
}

/** Best-effort signed-in user id; a guest reports anonymously. */
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
 * Best-effort resolve the shared-device row for this board so the report joins
 * the fleet registry. `devices.unique_id` uses the same `fw:<boardId>` key the
 * app already persists as `car_profiles.profile_key`.
 */
async function resolveDeviceId(boardId: string): Promise<string | null> {
  if (!supabaseConfigured || !boardId) return null;
  try {
    const { data } = await supabase
      .from("devices")
      .select("id")
      .eq("unique_id", `fw:${boardId}`)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * The one entry point the hub calls on connect. Builds the row, dedupes it
 * against the last synced record, and either pushes it or queues it for
 * retry. Never throws, so a diagnostics failure can never break a connection.
 */
export async function syncCrashReport(
  input: CrashReportInput,
  opts: { userId?: string | null; deviceId?: string | null } = {},
): Promise<{ sent: boolean; queued: boolean }> {
  try {
    const userId = opts.userId ?? (await currentUserId());
    const deviceId =
      opts.deviceId ?? (await resolveDeviceId(input.boardId ?? ""));
    const row = buildCrashReport(input, { userId, deviceId });
    if (!row.board_id) return { sent: false, queued: false };

    const lastKey = await readLastKey();
    if (!shouldSendReport(row, lastKey)) return { sent: false, queued: false };

    // Always try to flush older stranded reports first.
    await flushCrashReports();

    const ok = await pushRow(row);
    if (ok) {
      await writeLastKey(crashReportKey(row));
      return { sent: true, queued: false };
    }

    const queue = await readQueue();
    queue.push({ ...row, sync_status: "pending" });
    await writeQueue(queue);
    return { sent: false, queued: true };
  } catch {
    return { sent: false, queued: false };
  }
}
