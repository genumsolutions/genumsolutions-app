// =====================================================================
// toolsScreenFlow — pure logic for the Control Panel's deck-open debounce.
//
// The bug this module fixes (2026-10-02 audit, UX-2): the 150 ms debounce
// before RemoteControl navigation created its timer INSIDE the onPress
// callback and returned the cleanup from that same callback — React runs
// that cleanup immediately, cancelling the timer the moment onPress
// returns. On some React Native versions the tap then silently did
// nothing: the "Open … deck" button was a dead end on the first press.
//
// queueDeckOpen is the corrected scheduler: it cancels a PREVIOUS timer
// (double-tap lands one navigation), and its cancel function is returned
// to the CALLER to store — never consumed by the same tick that queued
// the work. Pinned by toolsScreenFlow.test.ts with fake timers.
// =====================================================================

export const DECK_OPEN_DEBOUNCE_MS = 150;

/**
 * Queue `push` to run after the debounce window. Pass a previous cancel
 * function to replace an in-flight timer (double-tap safety). Returns the
 * cancel function for the NEW timer — the component stores it (in a ref or
 * state) and must NOT invoke it synchronously.
 */
export function queueDeckOpen(
  previousCancel: (() => void) | null,
  push: () => void,
  timerMs: number = DECK_OPEN_DEBOUNCE_MS,
): () => void {
  previousCancel?.();
  const id = setTimeout(push, timerMs);
  return () => clearTimeout(id);
}
