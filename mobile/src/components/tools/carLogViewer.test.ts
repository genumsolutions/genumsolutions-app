// =====================================================================
// P7 / owner item D (2026-10-17) — the per-car LOG VIEWER.
//
// The car's half (P6) ships a bounded event ring and LOG?/LOG;GET;<n>/LOG
// ;CLEAR. The app's half is: parse the reply, merge the sources the owner
// sees, render THIS car's facts, and clear only on a confirmed dialog.
//
// The two FAILSAFES this file exists to pin:
//
//   F-90 — logs are per-device or they are rumours. Every merge input must
//   already be scoped to ONE car; the model never re-keys identities, and
//   every rendered row names its SOURCE (car / app / cloud) so a merged list
//   is a captioned history of ONE device, not a fleet mush.
//
//   F-61/F-88 — honesty at the edges. An empty ring parses as an empty list
//   (never a guess); a reply that is not ours parses as null (never eaten);
//   clear-on-car is impossible without a confirmed dialog behind it.
//
// No component harness exists (see dualLinkConnect.test.ts), so the wiring
// rules read the raw sources with comments stripped, literals KEPT. Every
// rule was proven both ways (mutate → red, restore → green) when written.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CAR_LOG_COMMANDS,
  CAR_EV,
  carEventRow,
  carLogChip,
  carLogLine,
  carLogCacheKey,
  cloudLogRows,
  localLogRows,
  mergeCarLogs,
  parseLogGetReply,
  resetReasonLabel,
} from "./carLogModel";

// --- the parse: tolerant, empty-honest, foreign-reply-neutral ------------

describe("P7 — parseLogGetReply reads the car's bounded answer", () => {
  it("parses a full window: six comma fields per event, newest first", () => {
    const parsed = parseLogGetReply(
      "LOG;GET;0;2=1,41,90200,53000,5,http-root;0,42,1000,60000,0,",
    );
    expect(parsed).toEqual({
      start: 0,
      total: 2,
      events: [
        {
          kind: 1,
          boot: 41,
          ms: 90200,
          heap: 53000,
          reason: 5,
          phase: "http-root",
        },
        { kind: 0, boot: 42, ms: 1000, heap: 60000, reason: 0, phase: "" },
      ],
    });
  });

  it("an EMPTY ring parses to an empty list — the car says zero, we show zero", () => {
    // The car answers `LOG;GET;0;0=` when the ring is empty: a viewer that
    // invented rows here would be manufacturing a bug report (F-61).
    expect(parseLogGetReply("LOG;GET;0;0=")).toEqual({
      start: 0,
      total: 0,
      events: [],
    });
  });

  it("a reply that is NOT ours parses as null — other REPLY= consumers keep theirs", () => {
    // REPLY= is a SHARED slot: WIFICFG, ROUTERS and TIME answers pass through
    // this parser and must come out null, not as garbage events.
    expect(parseLogGetReply("WIFICFG;STORED;home")).toBeNull();
    expect(parseLogGetReply("ROUTERS;STORED;a;b")).toBeNull();
    expect(parseLogGetReply("TIME;1700000000;1700000000")).toBeNull();
    expect(parseLogGetReply("LOG;CLEARED")).toBeNull();
    expect(parseLogGetReply(null)).toBeNull();
    expect(parseLogGetReply("")).toBeNull();
  });

  it("a malformed event is SKIPPED, the window still parses", () => {
    // '7,7' is 2 fields, 'x' is junk: neither is an event. The well-formed
    // one around them still lands — a log viewer that dies on one bad line
    // is a viewer the owner stops reading.
    const parsed = parseLogGetReply("LOG;GET;0;2=7,7;4,42,1200,61000,0,wifi;9");
    expect(parsed?.total).toBe(2);
    expect(parsed?.events).toHaveLength(1);
    expect(parsed?.events[0]?.kind).toBe(4);
    expect(parsed?.events[0]?.phase).toBe("wifi");
  });

  it("negative and non-numeric fields are rejected, never trusted", () => {
    expect(parseLogGetReply("LOG;GET;0;1=-2,5,1,1,0,boot")).toEqual({
      start: 0,
      total: 1,
      events: [],
    });
  });

  it("a nonsense header does not throw — null, and the caller moves on", () => {
    expect(parseLogGetReply("LOG;GET;x;y=")).toBeNull();
    expect(parseLogGetReply("LOG;GET;0")).toBeNull();
    expect(parseLogGetReply("LOG;")).toBeNull();
  });
});

// --- the commands: one wire shape, one owner -----------------------------

describe("P7 — the wire commands live in the model, not in call sites", () => {
  it("LOG;GET windows and LOG;CLEAR are built here", () => {
    expect(CAR_LOG_COMMANDS.get(0)).toBe("LOG;GET;0");
    expect(CAR_LOG_COMMANDS.get(3)).toBe("LOG;GET;3");
    expect(CAR_LOG_COMMANDS.get(-2)).toBe("LOG;GET;0"); // never a negative window
    expect(CAR_LOG_COMMANDS.clear()).toBe("LOG;CLEAR");
  });
});

// --- the presentation: the fact leads, chips are meaningful --------------

describe("P7 — rows lead with the fact and carry meaningful chips", () => {
  it("a FAULT event is the reset fact: kind, reason, phase, then the numbers", () => {
    expect(carLogChip(CAR_EV.FAULT)).toBe("reset");
    expect(resetReasonLabel(5)).toBe("TASK_WDT");
    const line = carLogLine({
      kind: CAR_EV.FAULT,
      boot: 41,
      ms: 123_000,
      heap: 8192,
      reason: 5,
      phase: "http-root",
    });
    expect(line.startsWith("FAULT · TASK_WDT · http-root")).toBe(true);
    expect(line).toContain("boot 41");
    expect(line).toContain("8.0 kB");
    expect(line).toContain("at 02:03 uptime");
  });

  it("the heap-side kinds are freezes, link edges are bugs, boots are info", () => {
    expect(carLogChip(CAR_EV.LOWHEAP)).toBe("freeze");
    expect(carLogChip(CAR_EV.LINKCAP)).toBe("freeze");
    expect(carLogChip(CAR_EV.LINKUP)).toBe("bug");
    expect(carLogChip(CAR_EV.LINKDOWN)).toBe("bug");
    expect(carLogChip(CAR_EV.BOOT)).toBe("info");
    // An unknown kind never manufactures a safety chip it did not earn.
    expect(carLogChip(9)).toBe("bug");
  });

  it("reset-reason labels mirror the car's vocabulary", () => {
    expect(resetReasonLabel(3)).toBe("PANIC");
    expect(resetReasonLabel(8)).toBe("BROWNOUT");
    expect(resetReasonLabel(0)).toBe("UNKNOWN");
  });
});

// --- the merge: newest-first, labelled, per-car --------------------------

describe("P7 — mergeCarLogs keeps every source named and every group honest", () => {
  it("merges the three sources in evidence order, every row labelled (F-90)", () => {
    const car = [
      carEventRow({
        kind: CAR_EV.FAULT,
        boot: 41,
        ms: 90_000,
        heap: 52000,
        reason: 5,
        phase: "http-root",
      }),
    ];
    const local = localLogRows([
      { ts: 200_000, level: "warn", message: "SPP backoff exhausted" },
    ]);
    const cloud = cloudLogRows([
      {
        reset_reason: "PANIC",
        boot_count: 39,
        crash_count: 2,
        last_crash_phase: "bt-stack",
        last_crash_heap: 60_000,
        created_at: "2026-10-17T12:00:00.000Z",
      },
    ]);
    const merged = mergeCarLogs(car, local, cloud);
    expect(merged).toHaveLength(3);
    // Grouped by evidence, NOT one global sort: the car's uptime clock (ms
    // since ITS boot) cannot be compared with the phone's wall clock, and a
    // merged chronology would invent one. Car ring first (just read), then
    // the local ring, then the cloud; every line names its own origin.
    expect(merged.map((r) => r.source)).toEqual(["car", "app", "cloud"]);
    expect(merged[0]?.line.startsWith("FAULT · TASK_WDT")).toBe(true);
    expect(merged[1]?.line.startsWith("WARN · SPP backoff exhausted")).toBe(
      true,
    );
    expect(merged[2]?.line.startsWith("RESET · PANIC")).toBe(true);
  });

  it("within a wall-clock group, newest comes first — the car ring keeps read order", () => {
    const local = localLogRows([
      { ts: 100, level: "info", message: "older" },
      { ts: 300, level: "info", message: "newer" },
    ]);
    // The wall-clock groups sort inside mergeCarLogs (newest first).
    expect(mergeCarLogs([], local, []).map((r) => r.line)).toEqual([
      "INFO · newer",
      "INFO · older",
    ]);
    // The car ring arrives newest-first from LOG;GET windows: no re-sort,
    // because uptime values are only comparable WITHIN one boot, and the
    // fetch window spans one or two boots at most.
    const car = [
      carEventRow({
        kind: CAR_EV.BOOT,
        boot: 43,
        ms: 500,
        heap: 60000,
        reason: 0,
        phase: "",
      }),
      carEventRow({
        kind: CAR_EV.BOOT,
        boot: 42,
        ms: 400,
        heap: 61000,
        reason: 0,
        phase: "",
      }),
    ];
    expect(mergeCarLogs(car, [], []).map((r) => r.line)).toEqual([
      "BOOT · boot 43 · heap 58.6 kB · at 00:00 uptime",
      "BOOT · boot 42 · heap 59.6 kB · at 00:00 uptime",
    ]);
  });

  it("the app-local ring is labelled from its levels", () => {
    const rows = localLogRows([
      { ts: 1, level: "error", message: "WS died" },
      { ts: 2, level: "info", message: "scan done" },
    ]);
    expect(rows.map((r) => r.chip)).toEqual(["bug", "info"]);
    expect(rows[0] && rows[0].source).toBe("app");
  });

  it("the cache key is per car — never a shared bucket (F-90)", () => {
    expect(carLogCacheKey("fw:01AB32")).toBe("genum.carlog.fw:01AB32");
    expect(carLogCacheKey(null)).toBe("genum.carlog.none");
    expect(carLogCacheKey("fw:11")).not.toBe(carLogCacheKey("fw:22"));
  });
});

// --- the wiring, read from source ----------------------------------------

const RAW_HUB = readFileSync(
  fileURLToPath(new NodeURL("./useControlHub.ts", import.meta.url)),
  "utf8",
);

const hubCode = RAW_HUB.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("P7 — useControlHub wires the answers and commands", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(RAW_HUB.length).toBeGreaterThan(1000);
    expect(hubCode).toContain("parseLogGetReply");
  });

  it("the LOG reply rides REPLY= to its own consumer", () => {
    // The SHARED slot fans out to every consumer; the log consumer must be
    // one of them AND ignore replies that are not LOG;GET (the parser's job).
    expect(hubCode).toContain("carLogReplyRef.current?.(t.reply);");
  });

  it("the fetch CHAINS windows until the ring is read", () => {
    expect(hubCode).toContain("CAR_LOG_COMMANDS.get(expectNext)");
    expect(hubCode).toContain("CAR_LOG_COMMANDS.get(0)");
  });

  it("clear is a LIVE command through the hub, cache dies with it", () => {
    expect(hubCode).toContain("CAR_LOG_COMMANDS.clear()");
    expect(hubCode).toContain(
      "AsyncStorage.removeItem(carLogCacheKeyRef.current)",
    );
  });

  it("the viewer's facts are exposed under their own names", () => {
    for (const needle of [
      "carLogEvents,",
      "carLogTotal,",
      "carLogFetchedAt,",
      "requestCarLog,",
      "clearCarLog,",
    ]) {
      expect(hubCode).toContain(needle);
    }
  });
});

const RAW_CARD = readFileSync(
  fileURLToPath(new NodeURL("./CarProfileCard.tsx", import.meta.url)),
  "utf8",
);

const cardCode = RAW_CARD.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("P7 — CarProfileCard renders THIS car's log behind a confirm", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(RAW_CARD.length).toBeGreaterThan(1000);
    expect(cardCode).toContain("CarLogDisclosure");
  });

  it("the viewer lives under the per-car profile card", () => {
    expect(cardCode).toContain('testID="car-log-viewer"');
    expect(cardCode).toContain("carLog ?? null");
  });

  it("the empty ring is honest, the stamp labels when it was read", () => {
    expect(cardCode).toContain('testID="car-log-stamp"');
    expect(cardCode).toContain("reports no events");
  });

  it("clear-on-car is impossible without the confirmed dialog wired", () => {
    // The guard keys on the caller's explicit `confirmClearCarLog` — a
    // caller that wires no dialog simply never gets a clear button.
    expect(cardCode).toContain("confirmClearCarLog === true");
    expect(cardCode).toContain('testID="car-log-clear"');
  });

  it("refresh reads the car, it does not invent local events", () => {
    expect(cardCode).toContain('testID="car-log-refresh"');
    expect(cardCode).toContain("onRefresh={onRefreshCarLog}");
  });
});

const RAW_TOOLS = readFileSync(
  fileURLToPath(new NodeURL("../../screens/ToolsScreen.tsx", import.meta.url)),
  "utf8",
);

const toolsCode = RAW_TOOLS.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("P7 — ToolsScreen confirms the destructive clear and scopes the merge", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(RAW_TOOLS.length).toBeGreaterThan(1000);
    expect(toolsCode).toContain("CarProfileCard");
  });

  it("the clear dialog is confirmed before the live command", () => {
    expect(toolsCode).toContain("Clear the car's event log?");
    expect(toolsCode).toContain('text: "Cancel", style: "cancel"');
    expect(toolsCode).toContain("hub.clearCarLog()");
  });

  it("the rows handed to the viewer come from the car's parsed ring", () => {
    expect(toolsCode).toContain("hub.carLogEvents.map((e) => carEventRow(e))");
  });
});
