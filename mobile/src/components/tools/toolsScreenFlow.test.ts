// =====================================================================
// toolsScreenFlow.test.ts — pins for the Control Panel screen's PURE logic.
//
// 1. The "Open deck" navigation debounce (2026-10-02 audit, UX-2): the
//    150 ms debounce before RemoteControl navigation created its timer
//    INSIDE the onPress callback and returned the cleanup from that same
//    callback — React runs that cleanup immediately, cancelling the timer
//    the moment onPress returns, so on some React Native versions the tap
//    silently did nothing. The scheduler is extracted and pinned here so
//    the debounce can never again be both created and cancelled in the
//    same tick.
// 2. The BT connect device resolution (2026-10-02 audit, OPS-3): a
//    connect request must never be relabelled by a STALE screen-level
//    scan row.
// =====================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DECK_OPEN_DEBOUNCE_MS,
  queueDeckOpen,
  resolveBtConnectDevice,
} from "./toolsScreenFlow";

describe("queueDeckOpen — the deck-open debounce must actually fire", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("navigates exactly once, after the debounce window", () => {
    const push = vi.fn();
    const cancel = queueDeckOpen(null, push);

    expect(push).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DECK_OPEN_DEBOUNCE_MS - 1);
    expect(push).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(push).toHaveBeenCalledTimes(1);

    cancel();
  });

  it("cancel() before the window elapses prevents the navigation", () => {
    const push = vi.fn();
    const cancel = queueDeckOpen(null, push);

    cancel();
    vi.advanceTimersByTime(DECK_OPEN_DEBOUNCE_MS * 2);
    expect(push).not.toHaveBeenCalled();
  });

  it("a second queue replaces the first — a double-tap navigates exactly once", () => {
    const push = vi.fn();
    const cancelFirst = queueDeckOpen(null, push);
    // The second tap cancels the first timer and queues its own; the second
    // timer is the one that fires.
    queueDeckOpen(cancelFirst, push);

    vi.advanceTimersByTime(DECK_OPEN_DEBOUNCE_MS * 2);
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe("resolveBtConnectDevice — the name the user JUST tapped wins", () => {
  // The hub's `sppDevices` list is mutable SCREEN state that a method switch
  // does not clear: after BT → Car-AP → BT the bridge can still find a row
  // from the EARLIER session whose name is stale (the car was renamed, or a
  // previous scan recorded the MAC fallback when the name was unresolved).
  // The picker's connect request carries the name from the row the user
  // tapped THIS time — that is the freshest truth and must outrank the
  // screen-level row (F-59 rule 2: read last-tapped truth only).
  const STALE_ROW = {
    id: "AA:BB:CC:DD:EE:FF",
    name: "AA:BB:CC:DD:EE:FF", // a MAC fallback name a previous scan recorded
    address: "AA:BB:CC:DD:EE:FF",
    bonded: true,
    lastMode: "DRIVE",
  };

  it("uses the fresh request name over a stale screen row's name", () => {
    const device = resolveBtConnectDevice(
      { address: STALE_ROW.address, name: "4WD CAR" },
      [STALE_ROW],
    );
    expect(device.name).toBe("4WD CAR");
    expect(device.address).toBe(STALE_ROW.address);
  });

  it("still resolves from the screen row when the request carries no name (F-40 path)", () => {
    const device = resolveBtConnectDevice(
      { address: STALE_ROW.address, name: undefined },
      [{ ...STALE_ROW, name: "4WD CAR" }],
    );
    expect(device.name).toBe("4WD CAR");
  });

  it("never fails the connect when the screen list lost the row (F-40 rule)", () => {
    const device = resolveBtConnectDevice(
      { address: "AA:BB:CC:DD:EE:FF", name: "4WD CAR" },
      [],
    );
    expect(device).toEqual({
      id: "AA:BB:CC:DD:EE:FF",
      name: "4WD CAR",
      address: "AA:BB:CC:DD:EE:FF",
      bonded: true,
    });
  });

  it("falls back to the MAC as the name when nothing else knows it", () => {
    const device = resolveBtConnectDevice(
      { address: "AA:BB:CC:DD:EE:FF", name: "" },
      [],
    );
    expect(device.name).toBe("AA:BB:CC:DD:EE:FF");
  });

  it("keeps the screen row's bonded flag and telemetry memory when listed", () => {
    const device = resolveBtConnectDevice(
      { address: STALE_ROW.address, name: "4WD CAR" },
      [STALE_ROW],
    );
    expect(device.bonded).toBe(true);
    expect(device.lastMode).toBe("DRIVE");
  });

  it("assumes bonded in the direct-MAC fallback (sppService validates + bonds)", () => {
    const device = resolveBtConnectDevice(
      { address: "AA:BB:CC:DD:EE:FF", name: null },
      [],
    );
    expect(device.bonded).toBe(true);
    expect(device.name).toBe("AA:BB:CC:DD:EE:FF");
  });
});
