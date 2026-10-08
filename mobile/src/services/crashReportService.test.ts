// =====================================================================
// crashReportService.test.ts — pins for the fleet crash-report sync.
//
// Owner (2026-10-08): "when the app connects to a car it should upload the
// car's crash/reset records to Supabase so bugs are tracked fleet-wide."
//
// The load-bearing rules these pin:
//   1. MISSING IS UNKNOWN, NEVER ZERO — old firmware sends no restart fields;
//      a report must not invent a crash.
//   2. has_crash is DERIVED from an actual crash_count, never defaulted.
//   3. ONE ROW PER RECORD — same board/boot/crash/reason is the same fault.
//   4. OFFLINE-FIRST — a failed push queues and flushes later.
//   5. NO board_id (nothing to tie the fault to) => nothing sent.
// =====================================================================
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());

const db = vi.hoisted(() => {
  const insert = vi.fn();
  const getUser = vi.fn();
  const maybeSingle = vi.fn();
  insert.mockImplementation(async () => ({ error: null }));
  getUser.mockImplementation(async () => ({ data: { user: null } }));
  maybeSingle.mockImplementation(async () => ({ data: null, error: null }));
  const client = {
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
    from: () => ({
      insert: (...a: unknown[]) => insert(...a),
      select: () => ({
        eq: () => ({ maybeSingle: (...a: unknown[]) => maybeSingle(...a) }),
      }),
    }),
  };
  return { insert, getUser, maybeSingle, client };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    removeItem: vi.fn(async (k: string) => {
      store.delete(k);
    }),
  },
}));

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

vi.mock("@supabase/supabase-js", () => ({
  default: () => db.client,
  createClient: () => db.client,
}));

vi.mock("../config/supabase", () => ({
  supabase: db.client,
  supabaseConfigured: true,
}));

vi.mock("../config/site", () => ({ APP_VERSION: "9.9.9" }));

import {
  buildCrashReport,
  crashReportKey,
  shouldSendReport,
  syncCrashReport,
} from "./crashReportService";

const FIXED_NOW = new Date("2026-10-08T10:00:00.000Z");

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  db.insert.mockImplementation(async () => ({ error: null }));
  db.getUser.mockImplementation(async () => ({ data: { user: null } }));
  db.maybeSingle.mockImplementation(async () => ({ data: null, error: null }));
});

describe("buildCrashReport — missing is unknown, never zero", () => {
  it("keeps absent restart fields null instead of defaulting to 0", () => {
    const row = buildCrashReport(
      { boardId: "1A2B3C", connectionMethod: "bluetooth" },
      { now: FIXED_NOW },
    );
    expect(row.boot_count).toBeNull();
    expect(row.crash_count).toBeNull();
    expect(row.reset_reason).toBeNull();
    expect(row.last_crash_phase).toBeNull();
    expect(row.last_crash_heap).toBeNull();
  });

  it("has_crash is true only when the car actually reported crashes", () => {
    const none = buildCrashReport(
      { boardId: "1A2B3C", connectionMethod: "wifi", crashCount: 0 },
      { now: FIXED_NOW },
    );
    expect(none.has_crash).toBe(false);

    const some = buildCrashReport(
      { boardId: "1A2B3C", connectionMethod: "wifi", crashCount: 3 },
      { now: FIXED_NOW },
    );
    expect(some.has_crash).toBe(true);

    const unknown = buildCrashReport(
      { boardId: "1A2B3C", connectionMethod: "wifi" },
      { now: FIXED_NOW },
    );
    expect(unknown.has_crash).toBe(false);
  });

  it("carries the app version, platform and stamps both timestamps", () => {
    const row = buildCrashReport(
      { boardId: "1A2B3C", connectionMethod: "wifi" },
      { now: FIXED_NOW },
    );
    expect(row.app_version).toBe("9.9.9");
    expect(row.platform).toBe("android");
    expect(row.reported_at).toBe(FIXED_NOW.toISOString());
    expect(row.synced_at).toBe(FIXED_NOW.toISOString());
    expect(row.sync_status).toBe("pending");
  });

  it("trims strings and drops blank ones to null", () => {
    const row = buildCrashReport(
      {
        boardId: "  1A2B3C  ",
        connectionMethod: "bluetooth",
        resetReason: "   ",
        ssid: "  Home  ",
      },
      { now: FIXED_NOW },
    );
    expect(row.board_id).toBe("1A2B3C");
    expect(row.reset_reason).toBeNull();
    expect(row.ssid).toBe("Home");
  });

  it("rejects non-finite numeric junk", () => {
    const row = buildCrashReport(
      {
        boardId: "A1",
        connectionMethod: "wifi",
        crashCount: Number.NaN,
        freeHeap: Number.POSITIVE_INFINITY,
        bootCount: 4,
      },
      { now: FIXED_NOW },
    );
    expect(row.crash_count).toBeNull();
    expect(row.free_heap).toBeNull();
    expect(row.boot_count).toBe(4);
  });
});

describe("crashReportKey / shouldSendReport — one row per record", () => {
  it("the same board/boot/crash/reason is the same key", () => {
    const a = buildCrashReport(
      {
        boardId: "1A2B3C",
        connectionMethod: "bluetooth",
        bootCount: 5,
        crashCount: 1,
        resetReason: "panic",
      },
      { now: FIXED_NOW },
    );
    const b = buildCrashReport(
      {
        boardId: "1A2B3C",
        connectionMethod: "wifi",
        bootCount: 5,
        crashCount: 1,
        resetReason: "panic",
      },
      { now: new Date("2026-10-09T00:00:00.000Z") },
    );
    expect(crashReportKey(a)).toBe(crashReportKey(b));
  });

  it("a new boot, a new crash or a changed reason is a new report", () => {
    const base = buildCrashReport(
      {
        boardId: "1A2B3C",
        connectionMethod: "bluetooth",
        bootCount: 5,
        crashCount: 1,
        resetReason: "panic",
      },
      { now: FIXED_NOW },
    );
    const key = crashReportKey(base);
    expect(shouldSendReport(base, key)).toBe(false);
    expect(shouldSendReport({ ...base, boot_count: 6 }, key)).toBe(true);
    expect(shouldSendReport({ ...base, crash_count: 2 }, key)).toBe(true);
    expect(shouldSendReport({ ...base, reset_reason: "brownout" }, key)).toBe(
      true,
    );
  });

  it("never sends a report with no board id — there is nothing to tie it to", () => {
    const row = buildCrashReport(
      { boardId: null, connectionMethod: "bluetooth" },
      { now: FIXED_NOW },
    );
    expect(shouldSendReport(row, null)).toBe(false);
  });
});

describe("syncCrashReport — pushes once, dedupes, queues offline", () => {
  const input = {
    boardId: "1A2B3C",
    connectionMethod: "bluetooth",
    resetReason: "sw_reset",
    bootCount: 4,
    crashCount: 2,
    lastCrashPhase: "drive_loop",
    lastCrashHeap: 12_000,
  };

  it("pushes a new record and records it as the last synced key", async () => {
    const res = await syncCrashReport(input);
    expect(res).toEqual({ sent: true, queued: false });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.insert.mock.calls[0][0].sync_status).toBe("synced");
  });

  it("does not re-push the exact same record", async () => {
    await syncCrashReport(input);
    db.insert.mockClear();
    const res = await syncCrashReport(input);
    expect(res).toEqual({ sent: false, queued: false });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("queues when the network fails, then flushes on the next connect", async () => {
    db.insert.mockResolvedValueOnce({ error: { message: "offline" } });
    const first = await syncCrashReport(input);
    expect(first).toEqual({ sent: false, queued: true });
    expect(store.get("genum.crashReports.queue")).toContain("1A2B3C");

    // Next connect succeeds: the stranded report is flushed AND the new one goes.
    const next = { ...input, bootCount: 5 };
    const second = await syncCrashReport(next);
    expect(second).toEqual({ sent: true, queued: false });
    // First attempt (failed) + the flushed queued row + the fresh insert.
    expect(db.insert).toHaveBeenCalledTimes(3);
  });

  it("reports nothing for a car with no board id", async () => {
    const res = await syncCrashReport({ connectionMethod: "wifi" });
    expect(res).toEqual({ sent: false, queued: false });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("no-ops safely when the table is unreachable at resolve time", async () => {
    db.maybeSingle.mockRejectedValueOnce(new Error("boom"));
    const res = await syncCrashReport(input);
    // device_id resolution failure must not stop the report.
    expect(res.sent).toBe(true);
  });
});
