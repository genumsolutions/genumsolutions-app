// =====================================================================
// toolsScreenFlow.test.ts — pins for the "Open deck" navigation debounce.
//
// The bug these tests pin (found in the 2026-10-02 audit, UX-2): the
// 150 ms debounce before RemoteControl navigation created its timer
// INSIDE the onPress callback and returned the cleanup from that same
// callback — React runs that cleanup immediately, cancelling the timer
// the moment onPress returns, so on some React Native versions the tap
// silently did nothing. The scheduler is extracted and pinned here so
// the debounce can never again be both created and cancelled in the
// same tick.
// =====================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DECK_OPEN_DEBOUNCE_MS, queueDeckOpen } from "./toolsScreenFlow";

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
