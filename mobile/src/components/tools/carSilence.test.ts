// =====================================================================
// U-121 Phase D (owner 2026-10-23) — "the car freezes and the app doesn't
// know about that" — the silence detector, pinned.
//
// Layer 1 — `isCarSilent` is PURE and imported directly: the honesty rules
// (no link ⇒ never silent; the window counts from the LAST frame, or from
// link-up when no frame ever arrived) are proven by behaviour.
//
// Layer 2 — the wiring reads the raw sources with comments stripped (same
// convention as remoteChrome.test.ts): the hub stamps every car frame,
// evaluates the rule on a bounded tick while linked, exposes `carSilent`,
// and the Remote screen paints the honest strip.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";

import { CAR_SILENT_MS, isCarSilent } from "./carSilence";

function raw(rel: string): string {
  return readFileSync(fileURLToPath(new NodeURL(rel, import.meta.url)), "utf8");
}

function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:"'\\])\/\/.*$/, "$1"))
    .join("\n");
}

const hub = strip(raw("./useControlHub.ts"));
const screen = strip(raw("../../screens/RemoteControlScreen.tsx"));

describe("isCarSilent — the honest rule for a stopped car", () => {
  const base = {
    linked: true,
    nowMs: 100_000,
    lastFrameAtMs: 99_000 as number | null,
    sinceLinkUpMs: 90_000 as number | null,
  };

  it("never silent with no link (there is nothing to answer with)", () => {
    expect(isCarSilent({ ...base, linked: false })).toBe(false);
  });

  it("never silent with no link session at all", () => {
    expect(isCarSilent({ ...base, sinceLinkUpMs: null })).toBe(false);
  });

  it("fresh frames keep it quiet", () => {
    expect(isCarSilent(base)).toBe(false);
    // Right up to (but under) the window.
    expect(
      isCarSilent({ ...base, lastFrameAtMs: base.nowMs - (CAR_SILENT_MS - 1) }),
    ).toBe(false);
  });

  it("silent once the whole window passes without a frame", () => {
    expect(
      isCarSilent({ ...base, lastFrameAtMs: base.nowMs - CAR_SILENT_MS }),
    ).toBe(true);
    expect(
      isCarSilent({ ...base, lastFrameAtMs: base.nowMs - (CAR_SILENT_MS + 1) }),
    ).toBe(true);
  });

  it("a car that never answered counts from LINK-UP, not from null", () => {
    // The connect-time freeze: the link came up, no frame EVER arrived.
    // Counting from null (or never firing) would hide exactly this case.
    expect(
      isCarSilent({
        ...base,
        lastFrameAtMs: null,
        sinceLinkUpMs: base.nowMs - (CAR_SILENT_MS + 1),
      }),
    ).toBe(true);
    expect(
      isCarSilent({
        ...base,
        lastFrameAtMs: null,
        sinceLinkUpMs: base.nowMs - (CAR_SILENT_MS - 1),
      }),
    ).toBe(false);
  });

  it("a fresh link never inherits a stale verdict", () => {
    // Link came up 3 s ago; the PREVIOUS session's last frame is irrelevant
    // by construction (the hub clears the ref on link-down) — the model's
    // own rule: a recent link-up with no frames yet is not silent.
    expect(
      isCarSilent({
        ...base,
        lastFrameAtMs: null,
        sinceLinkUpMs: base.nowMs - 3_000,
      }),
    ).toBe(false);
  });

  it("the window is generous (~5 missed 1.5 s heartbeats), never twitchy", () => {
    expect(CAR_SILENT_MS).toBeGreaterThanOrEqual(8000);
  });
});

describe("U-121 Phase D — the hub stamps frames and evaluates the rule", () => {
  it("every car frame refreshes the silence clock", () => {
    const at = hub.indexOf("const applyTelemetry = (t: CarTelemetry) => {");
    expect(at).toBeGreaterThan(0);
    const head = hub.slice(at, at + 700);
    expect(head).toContain("lastCarFrameRef.current = Date.now();");
  });

  it("the detector state exists, is ticked while linked, and resets", () => {
    expect(hub).toContain("const [carSilent, setCarSilent] = useState(false);");
    expect(hub).toContain(
      "const lastCarFrameRef = useRef<number | null>(null);",
    );
    expect(hub).toContain("const linkUpAtRef = useRef<number | null>(null);");
    // The bounded tick evaluates the PURE rule (both facts fed in).
    expect(hub).toContain("isCarSilent({");
    expect(hub).toContain("lastFrameAtMs: lastCarFrameRef.current,");
    expect(hub).toContain("sinceLinkUpMs: linkUpAtRef.current,");
    expect(hub).toContain("setInterval(evaluate, 2000)");
    // No link ⇒ no interval and a clean slate (a fresh link starts honest).
    expect(hub).toContain("setCarSilent(false);");
  });

  it("carSilent is part of the hub's public surface", () => {
    expect(hub).toContain("carSilent,");
  });
});

describe("U-121 Phase D — the Remote deck says so honestly", () => {
  it("the strip renders from the hub verdict with an honest instruction", () => {
    expect(screen).toContain("{hub.connectionMessage || hub.carSilent ? (");
    expect(screen).toContain("may have frozen");
    // It reuses the ONE inline-message primitive — no new design language.
    expect(screen).toContain("The car has not answered for a while");
  });
});
