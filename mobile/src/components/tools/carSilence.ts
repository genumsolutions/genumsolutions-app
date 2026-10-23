// =====================================================================
// U-121 Phase D (owner 2026-10-23) — \"the car freezes and the app doesn't
// know about that.\"
//
// The owner's field report: Bluetooth on, the Wi-Fi drops, the heap collapses
// (109 KB → 15 KB) and the CAR freezes — while the app keeps showing a live
// link, because a link being up says nothing about the car answering. The
// transport layer only notices a freeze when a socket/SPP write fails, which
// a frozen-but-not-yet-dead ESP32 can delay for a long time.
//
// This module is the ONE honest rule for that state: the car broadcasts
// STATE on every live link every 1.5 s (car-side STATE_INTERVAL_MS), so a
// linked car that has sent NOTHING for CAR_SILENT_MS is not \"busy\" — it has
// stopped answering. Pure and exported so the rule is proven by behaviour
// with no renderer and no timer (the hub feeds it a clock).
//
// Honesty rules:
//   * no link ⇒ never silent (there is nothing to answer WITH);
//   * the window counts from the LAST car frame, and — when no frame has
//     arrived at all on this link — from the LINK-UP instant itself, so a car
//     that freezes during connect is caught too;
//   * the window is deliberately ~5 missed heartbeats: a deferred status
//     broadcast under heap pressure (the car's own heap-guard deferral) can
//     skip a few ticks without being frozen.
// =====================================================================

/**
 * The silence window. The car's STATE cadence is 1.5 s (Config.h
 * STATE_INTERVAL_MS) and the app's telemetry freshness budget is 5 s
 * (TELEMETRY_FRESH_MS) — 8 s is ~5 missed heartbeats: generous enough that a
 * heap-guarded deferral never reads as a freeze, short enough that a frozen
 * car is named while the user still cares.
 */
export const CAR_SILENT_MS = 8000;

export type CarSilenceInput = {
  /** A transport link is up (Bluetooth or Wi-Fi). */
  readonly linked: boolean;
  /** The clock (Date.now()). */
  readonly nowMs: number;
  /** When the LAST car frame arrived on the current link (null = none yet). */
  readonly lastFrameAtMs: number | null;
  /** When the current link came up (null = no link session). */
  readonly sinceLinkUpMs: number | null;
  /** Override for tests. */
  readonly windowMs?: number;
};

/** True when a LINKED car has stopped answering for the whole window. */
export function isCarSilent(input: CarSilenceInput): boolean {
  const {
    linked,
    nowMs,
    lastFrameAtMs,
    sinceLinkUpMs,
    windowMs = CAR_SILENT_MS,
  } = input;
  if (!linked) return false;
  if (sinceLinkUpMs == null) return false;
  const ref = lastFrameAtMs ?? sinceLinkUpMs;
  return nowMs - ref >= windowMs;
}
