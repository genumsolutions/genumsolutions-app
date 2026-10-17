// =====================================================================
// carLogModel — the pure half of the per-car log viewer (P7, owner item D
// 2026-10-17). The car's half (P6) ships a bounded event ring and three
// verbs; this module owns everything the app does with their replies:
//
//   * parse ONE `LOG;GET;<n>;<total>=k,boot,ms,heap,reason,phase;…` REPLY=
//     into typed events — tolerant (a malformed catalyst event is SKIPPED,
//     never a crash) and honest (an empty ring parses as zero events, never
//     a guess);
//   * turn an event into the ONE line the owner acts on (F-86 shape: the
//     fact leads — kind + reset reason + phase — counts and bytes follow);
//   * label each kind with the chip the viewer renders
//     (reset / freeze / bug / info);
//   * merge the THREE sources the owner sees (the car's ring over LOG;GET,
//     this phone's app log ring scoped to the car, the cloud
//     device_crash_reports rows) into one newest-first list, each row
//     LABELLED with its source — F-90: logs are per-device, so merging is
//     only ever INTRA one car (the caller passes pre-scoped arrays; this
//     module never re-keys or invents identities).
//
// No I/O, no React, no AsyncStorage — the viewer component and the hub own
// that. Pure means testable, which is where these rules live.
// =====================================================================

/** The car's CAR_EV_* kind numbers (CrashLog.h — mirror, do not renumber). */
export const CAR_EV = {
  BOOT: 0,
  FAULT: 1,
  LOWHEAP: 2,
  LINKCAP: 3,
  LINKUP: 4,
  LINKDOWN: 5,
} as const;

/** One parsed car event (six comma fields on the wire). */
export type CarLogEntry = {
  kind: number;
  /** The boot counter when the event happened. */
  boot: number;
  /** millis() at the event, as the car measured it. */
  ms: number;
  /** Free heap at the event. */
  heap: number;
  /** esp_reset_reason_t for faults, 0 otherwise (mirrors the wire). */
  reason: number;
  /** The firmware-literal phase ("", when not applicable) — never network input. */
  phase: string;
};

/** The severity chip the viewer shows. */
export type CarLogChip = "reset" | "freeze" | "bug" | "info";

/** Source labels — every viewer row names WHERE it came from (F-90). */
export type CarLogSource = "car" | "app" | "cloud";

export type CarLogRow = {
  chip: CarLogChip;
  source: CarLogSource;
  /** The one human line, fact first (F-86). */
  line: string;
  /** Sort key, newest first. Sourced truthfully per source (see merge). */
  at: number;
};

export type ParsedLogGet = {
  /** The window start the car answered (newest-first index). */
  start: number;
  /** How many events the car says the ring holds in total. */
  total: number;
  /** The parsed events in this window (possibly fewer than the cap). */
  events: CarLogEntry[];
};

/**
 * The chip label for a CAR_EV_* kind. FAULT is a reset; the two HEAP-side
 * kinds are what a freeze looks like from inside the car; BOOT/LINK edges
 * are informational.
 */
export function carLogChip(kind: number): CarLogChip {
  if (kind === CAR_EV.FAULT) return "reset";
  if (kind === CAR_EV.LOWHEAP || kind === CAR_EV.LINKCAP) return "freeze";
  if (kind === CAR_EV.BOOT) return "info";
  return "bug";
}

/** Human label for a CAR_EV_* kind (mirrors the car's carEventKindLabel()). */
export function carLogKindLabel(kind: number): string {
  switch (kind) {
    case CAR_EV.BOOT:
      return "BOOT";
    case CAR_EV.FAULT:
      return "FAULT";
    case CAR_EV.LOWHEAP:
      return "LOW-HEAP";
    case CAR_EV.LINKCAP:
      return "LINK-REFUSED";
    case CAR_EV.LINKUP:
      return "LINK-UP";
    case CAR_EV.LINKDOWN:
      return "LINK-DOWN";
    default:
      return "UNKNOWN";
  }
}

/**
 * Human label for an esp_reset_reason_t NUMBER, mirroring the car's
 * resetLabel(). LOG;GET carries the number; /status carries the label — the
 * viewer shows one consistent vocabulary whichever source a row came from.
 */
export function resetReasonLabel(reason: number): string {
  switch (reason) {
    case 1:
      return "POWER_ON";
    case 2:
      return "SOFTWARE_RESTART";
    case 3:
      return "PANIC";
    case 4:
      return "INTERRUPT_WDT";
    case 5:
      return "TASK_WDT";
    case 6:
      return "OTHER_WDT";
    case 7:
      return "DEEP_SLEEP_WAKE";
    case 8:
      return "BROWNOUT";
    case 9:
      return "SDIO";
    case 254:
      return "EXTERNAL_RESET";
    default:
      return "UNKNOWN";
  }
}

/**
 * Parse the car's answer to `LOG;GET;<n>`. Wire shapes (WebServerComm.h /
 * handleLogCommand):
 *
 *     LOG;GET;<start>;<total>=k,boot,ms,heap,reason,phase;…
 *     LOG;GET;0;<total>=        (the ring is empty — honest zero)
 *
 * Returns null when the reply is NOT a LOG;GET reply (other REPLY= users —
 * WIFICFG/ROUTERS/TIME — must be left to their own consumers). Malformed
 * events are skipped, never thrown: a log viewer that crashes on one bad
 * line is worse than no viewer (F-61: the data is the deliverable).
 */
export function parseLogGetReply(
  reply: string | null | undefined,
): ParsedLogGet | null {
  if (!reply) return null;
  const text = reply.trim();
  const m = /^LOG;GET;(\d+);(\d+)=(.*)$/.exec(text);
  if (!m) return null;
  const start = Number(m[1]);
  const total = Number(m[2]);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(total) ||
    start < 0 ||
    total < 0
  ) {
    return null;
  }
  const events: CarLogEntry[] = [];
  const body = m[3] ?? "";
  if (body.length > 0) {
    for (const token of body.split(";")) {
      const parts = token.split(",");
      if (parts.length !== 6) continue; // not an event — skip, keep reading
      const nums = parts.slice(0, 5).map((p) => Number(p));
      if (nums.some((n) => !Number.isFinite(n) || n < 0)) continue;
      events.push({
        kind: nums[0],
        boot: nums[1],
        ms: nums[2],
        heap: nums[3],
        reason: nums[4],
        // The phase is the six field as delivered — firmware literals only.
        phase: parts[5] ?? "",
      });
    }
  }
  return { start, total, events };
}

/** The links that fetch and clear, so the wire shapes live in ONE module. */
export const CAR_LOG_COMMANDS = {
  get: (window_: number): string =>
    `LOG;GET;${Math.max(0, Math.floor(window_))}`,
  clear: (): string => "LOG;CLEAR",
} as const;

/** ~48 chars/event worst case, 3 per window keeps REPLY under its 191 cap. */
export const CAR_LOG_WINDOW = 3;

export type CarLogFetchPlan = {
  commands: string[];
  expectedWindows: number;
};

/**
 * The windows to answer to read the whole ring, bounded by what the owner
 * actually needs: the newest CAR_LOG_MAX_FETCH events, never the history of
 * the universe.
 */
export const CAR_LOG_MAX_FETCH = 12;

/** One row as the app's LOCAL ring holds it (appLogService — see types). */
export type LocalLogLike = {
  ts: number;
  level: string;
  message: string;
};

/** One row as the CLOUD holds it (device_crash_reports — reduced fields). */
export type CloudLogLike = {
  reset_reason: string | null;
  boot_count: number | null;
  crash_count: number | null;
  last_crash_phase: string | null;
  last_crash_heap: number | null;
  created_at: string | null;
};

/** The one line an event reads as: the FACT leads, the counts follow (F-86). */
export function carLogLine(e: CarLogEntry): string {
  const bits: string[] = [carLogKindLabel(e.kind)];
  if (e.reason > 0) bits.push(resetReasonLabel(e.reason));
  if (e.phase) bits.push(e.phase);
  bits.push(`boot ${e.boot}`);
  bits.push(`heap ${(e.heap / 1024).toFixed(1)} kB`);
  const secs = Math.floor(e.ms / 1000);
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  bits.push(
    `at ${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")} uptime`,
  );
  return bits.join(" · ");
}

/** Turn ONE car event into a viewer row. */
export function carEventRow(
  e: CarLogEntry,
  source: CarLogSource = "car",
): CarLogRow {
  // ms is millis() at the event since the car boot that follows it — a
  // monotonic, per-car truth; it is not a wall clock and is never presented
  // as one. It sorts within the window the fetch read.
  return {
    chip: carLogChip(e.kind),
    source,
    line: carLogLine(e),
    at: e.ms * 1000,
  };
}

/**
 * Merge the row groups into ONE list, each row labelled with its source.
 *
 * WHY GROUPED AND NOT ONE GLOBAL SORT. The car's rows are keyed by CAR
 * UPTIME (`ms` — the ESP32 has no RTC, so the car cannot know wall time,
 * CrashLog.h says so explicitly). The app's ring and the cloud rows carry
 * the phone's wall clock. Sorting uptime against wall clock would ORDER
 * facts that cannot be compared — a cross-source chronology the data does
 * not contain. So each group sorts within itself (newest first, where
 * "newest" is knowable), and the groups are ordered by which feed is the
 * freshest EVIDENCE for this car: the car's own ring (just read from the
 * device), then this phone's ring, then the cloud. Every row names its
 * source, so the reader sees three captioned timelines, never one invented
 * one (F-90/F-61 shape: label what you know and where you know it from).
 */
export function mergeCarLogs(
  carRows: CarLogRow[],
  localRows: CarLogRow[],
  cloudRows: CarLogRow[],
): CarLogRow[] {
  const car = [...carRows]; // the ring answer is newest-first already
  const local = [...localRows].sort((a, b) => b.at - a.at);
  const cloud = [...cloudRows].sort((a, b) => b.at - a.at);
  return [...car, ...local, ...cloud];
}

/** Local-ring rows → labelled rows (seconds → ms sort key). */
export function localLogRows(rows: LocalLogLike[]): CarLogRow[] {
  return rows.map((r) => ({
    chip: r.level === "error" ? "bug" : r.level === "warn" ? "freeze" : "info",
    source: "app" as const,
    line: `${r.level.toUpperCase()} · ${r.message}`,
    // message may name the car; the CALLER scopes the ring (F-90).
    at: Math.floor(r.ts),
  }));
}

/** Cloud rows ("device_crash_reports", one per session) → labelled rows. */
export function cloudLogRows(rows: CloudLogLike[]): CarLogRow[] {
  return rows.map((r) => {
    const label = (r.reset_reason ?? "UNKNOWN").toUpperCase();
    const bits = [`RESET · ${label}`];
    if (r.last_crash_phase) bits.push(r.last_crash_phase);
    bits.push(`boot ${r.boot_count ?? 0}`, `crashes ${r.crash_count ?? 0}`);
    if (typeof r.last_crash_heap === "number" && r.last_crash_heap > 0) {
      bits.push(`heap ${(r.last_crash_heap / 1024).toFixed(1)} kB`);
    }
    return {
      chip: "reset" as CarLogChip,
      source: "cloud" as CarLogSource,
      line: bits.join(" · "),
      at: r.created_at ? Date.parse(r.created_at) || 0 : 0,
    };
  });
}

/** The cache key the viewer's cached/offline view lives under (per car). */
export function carLogCacheKey(profileKey: string | null): string {
  return `genum.carlog.${profileKey ?? "none"}`;
}
